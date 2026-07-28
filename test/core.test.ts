import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  LocalObservationStore,
  buildFallbackPlan,
  classifyTask,
  createObservation,
  decideCompaction,
  decideRoute,
  discoverCandidates,
  nextHealthState,
  recommend,
  resolveCandidate,
  scoreCandidate,
  validateConfig,
  type ModelCandidate,
  type Observation,
  type StewardConfig,
} from "../src/index.js";

const fast: ModelCandidate = {
  provider: "local",
  model: "fast",
  enabled: true,
};
const strong: ModelCandidate = {
  provider: "cloud",
  model: "strong",
  enabled: true,
};
const features = classifyTask("fix the test failure in this repository");

function observation(
  candidate: ModelCandidate,
  outcome: Observation["outcome"],
  costUsd: number,
  latencyMs: number,
): Observation {
  return createObservation(
    {
      model: candidate,
      features,
      outcome,
      costUsd,
      latencyMs,
      source: "benchmark",
    },
    new Date("2026-01-01T00:00:00Z"),
  );
}

function config(overrides: Partial<StewardConfig> = {}): StewardConfig {
  return {
    ...DEFAULT_CONFIG,
    candidates: [fast, strong],
    minimumSamples: 2,
    explorationRate: 0,
    ...overrides,
  };
}

describe("task classification", () => {
  it("classifies security release work as high risk", () => {
    expect(
      classifyTask("publish a security vulnerability release"),
    ).toMatchObject({ category: "security", risk: "high" });
  });

  it("detects tool-requiring coding tasks", () => {
    expect(features.requiresTools).toBe(true);
  });
});

describe("configuration", () => {
  it("rejects duplicate provider/model candidates", () => {
    expect(validateConfig({ ...config(), candidates: [fast, fast] })).toContain(
      "Candidates must be unique by provider/model.",
    );
  });

  it("rejects invalid exploration", () => {
    expect(validateConfig({ ...config(), explorationRate: 2 })).toContain(
      "explorationRate must be between 0 and 1.",
    );
  });
});

describe("provider and model compatibility", () => {
  it("treats each provider/model pair independently", () => {
    const models = [
      { provider: "openrouter", id: "vendor/a", input: ["text"] },
      { provider: "openrouter", id: "vendor/b", input: ["text", "image"] },
    ];
    expect(
      resolveCandidate(
        {
          provider: "openrouter",
          model: "vendor/b",
          enabled: true,
          supportsImages: true,
        },
        models,
      ).compatible,
    ).toBe(true);
    expect(
      resolveCandidate(
        {
          provider: "openrouter",
          model: "vendor/a",
          enabled: true,
          supportsImages: true,
        },
        models,
      ).compatible,
    ).toBe(false);
  });

  it("discovers multiple models per provider within explicit limits", () => {
    const discovered = discoverCandidates(
      [
        { provider: "local", id: "qwen:7b" },
        { provider: "local", id: "qwen:32b" },
        { provider: "cloud", id: "other" },
      ],
      {
        providerAllowlist: ["local"],
        modelAllowPatterns: ["qwen:*"],
        defaultEnabled: false,
        maximumCandidates: 10,
      },
    );
    expect(discovered).toHaveLength(2);
    expect(discovered.every((candidate) => !candidate.enabled)).toBe(true);
  });
});

describe("scoring and routing", () => {
  const observations = [
    observation(fast, "success", 0.001, 500),
    observation(fast, "success", 0.001, 600),
    observation(strong, "success", 0.1, 2_000),
    observation(strong, "failure", 0.1, 2_000),
  ];

  it("prefers the successful lower-cost lower-latency model", () => {
    expect(
      recommend(config(), observations, features, () => 0.9).selected,
    ).toEqual(fast);
  });

  it("blocks models not approved for high-risk tasks", () => {
    const score = scoreCandidate(
      fast,
      observations,
      { ...features, risk: "high" },
      config().weights,
      2,
      [],
    );
    expect(score.eligible).toBe(false);
  });

  it("never switches in observe mode", () => {
    const decision = decideRoute(
      config({ mode: "observe" }),
      observations,
      features,
      strong,
      new Map(),
      () => 0.9,
    );
    expect(decision.shouldSwitch).toBe(false);
  });

  it("switches in route mode when a better candidate is available", () => {
    const decision = decideRoute(
      config({ mode: "route" }),
      observations,
      features,
      strong,
      new Map(),
      () => 0.9,
    );
    expect(decision.shouldSwitch).toBe(true);
    expect(decision.attempts[0]).toEqual(fast);
  });
});

describe("compaction", () => {
  it("compacts only above token and percentage thresholds", () => {
    const policy = DEFAULT_CONFIG.compaction;
    expect(
      decideCompaction(
        policy,
        { tokens: 40_000, contextWindow: 50_000, percent: 80 },
        undefined,
        false,
        1_000,
      ).shouldCompact,
    ).toBe(true);
    expect(
      decideCompaction(
        policy,
        { tokens: 10_000, contextWindow: 50_000, percent: 80 },
        undefined,
        false,
        1_000,
      ).shouldCompact,
    ).toBe(false);
  });

  it("respects cooldown and unavailable measurements", () => {
    const policy = DEFAULT_CONFIG.compaction;
    expect(decideCompaction(policy, undefined, undefined).shouldCompact).toBe(
      false,
    );
    expect(
      decideCompaction(
        policy,
        { tokens: 40_000, contextWindow: 50_000, percent: 80 },
        1_000,
        false,
        2_000,
      ).shouldCompact,
    ).toBe(false);
  });

  it("allows task-complete compaction once minimum tokens are reached", () => {
    const policy = {
      ...DEFAULT_CONFIG.compaction,
      trigger: "task-complete" as const,
    };
    expect(
      decideCompaction(
        policy,
        { tokens: 25_000, contextWindow: 100_000, percent: 25 },
        undefined,
        true,
      ).shouldCompact,
    ).toBe(true);
  });
});

describe("fallbacks", () => {
  it("opens a circuit after three failures and later recovers", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const one = nextHealthState(undefined, false, now);
    const two = nextHealthState(one, false, now);
    const three = nextHealthState(two, false, now);
    expect(three.unavailableUntil).toBeDefined();
    expect(nextHealthState(three, true, now)).toEqual({
      consecutiveFailures: 0,
    });
  });

  it("keeps the current healthy candidate first in a fallback plan", () => {
    expect(
      buildFallbackPlan(
        [fast, strong],
        strong,
        features,
        new Map(),
        [],
        new Date(),
      ).ordered[0],
    ).toEqual(strong);
  });
});

describe("local telemetry", () => {
  it("stores only structured observations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "model-steward-"));
    const path = join(directory, "observations.jsonl");
    const store = new LocalObservationStore(path);
    const item = observation(fast, "success", 0.01, 100);
    await store.append(item);
    expect(await store.readAll()).toEqual([item]);
    expect(await readFile(path, "utf8")).not.toContain("fix the test failure");
  });

  it("rejects secret-like material", async () => {
    const directory = await mkdtemp(join(tmpdir(), "model-steward-"));
    const store = new LocalObservationStore(
      join(directory, "observations.jsonl"),
    );
    const unsafe = {
      ...observation(fast, "success", 0, 0),
      features: { ...features, category: "api_key=secret" },
    };
    await expect(store.append(unsafe)).rejects.toThrow("secret-like material");
  });
});
