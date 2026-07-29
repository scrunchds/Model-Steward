import { homedir } from "node:os";
import { join } from "node:path";
import type { StewardConfig } from "./types.js";

export const DEFAULT_CONFIG: StewardConfig = {
  mode: "observe",
  candidates: [],
  weights: { quality: 0.65, cost: 0.15, latency: 0.1, uncertainty: 0.1 },
  minimumSamples: 10,
  explorationRate: 0.05,
  highRiskAllowlist: [],
  localDataDirectory: join(homedir(), ".model-steward"),
  preserveCurrentOnTie: true,
  fallbackToCurrent: true,
  compaction: {
    enabled: true,
    trigger: "hybrid",
    thresholdPercent: 65,
    cooldownMinutes: 15,
    minimumTokens: 20_000,
    compactAfterSuccessfulTask: true,
  },
  memory: {
    enabled: false,
    maxEntries: 500,
    maxEntryCharacters: 1_500,
    retrievalLimit: 5,
    injectionTokenBudget: 800,
    retentionDays: 90,
  },
  pricing: {
    remoteEnabled: false,
    openRouterEnabled: true,
    liteLlmEnabled: true,
    timeoutMs: 10_000,
    maxResponseBytes: 5_000_000,
    maxSnapshotAgeHours: 168,
  },
};

export function validateConfig(config: StewardConfig): readonly string[] {
  const errors: string[] = [];
  if (!isObject(config)) return ["Model steward config must be an object."];
  if (!["observe", "recommend", "route", "auto"].includes(config.mode))
    errors.push("mode must be observe, recommend, route, or auto.");
  const weights = Object.values(config.weights);
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0))
    errors.push("Objective weights must be finite non-negative numbers.");
  if (weights.reduce((sum, weight) => sum + weight, 0) <= 0)
    errors.push("At least one objective weight must be positive.");
  if (!Number.isInteger(config.minimumSamples) || config.minimumSamples < 1)
    errors.push("minimumSamples must be a positive integer.");
  if (config.explorationRate < 0 || config.explorationRate > 1)
    errors.push("explorationRate must be between 0 and 1.");
  if (typeof config.preserveCurrentOnTie !== "boolean")
    errors.push("preserveCurrentOnTie must be a boolean.");
  if (typeof config.fallbackToCurrent !== "boolean")
    errors.push("fallbackToCurrent must be a boolean.");
  if (
    typeof config.localDataDirectory !== "string" ||
    !config.localDataDirectory
  )
    errors.push("localDataDirectory must be a non-empty string.");
  if (!Array.isArray(config.highRiskAllowlist)) {
    errors.push("highRiskAllowlist must be an array.");
  } else if (
    config.highRiskAllowlist.some(
      (item) => typeof item !== "string" || item.length === 0,
    )
  ) {
    errors.push("highRiskAllowlist entries must be non-empty strings.");
  }
  if (typeof config.compaction.enabled !== "boolean")
    errors.push("compaction.enabled must be a boolean.");
  if (
    !["threshold", "task-complete", "hybrid", "manual"].includes(
      config.compaction.trigger,
    )
  )
    errors.push(
      "compaction.trigger must be threshold, task-complete, hybrid, or manual.",
    );
  if (
    config.compaction.thresholdPercent < 10 ||
    config.compaction.thresholdPercent > 95
  )
    errors.push("compaction.thresholdPercent must be between 10 and 95.");
  if (
    !Number.isFinite(config.compaction.cooldownMinutes) ||
    config.compaction.cooldownMinutes < 1
  )
    errors.push("compaction.cooldownMinutes must be at least 1.");
  if (
    !Number.isFinite(config.compaction.minimumTokens) ||
    config.compaction.minimumTokens < 1
  )
    errors.push("compaction.minimumTokens must be positive.");
  if (typeof config.compaction.compactAfterSuccessfulTask !== "boolean")
    errors.push("compaction.compactAfterSuccessfulTask must be a boolean.");
  if (typeof config.memory.enabled !== "boolean")
    errors.push("memory.enabled must be a boolean.");
  if (
    !Number.isInteger(config.memory.maxEntries) ||
    config.memory.maxEntries < 1
  )
    errors.push("memory.maxEntries must be a positive integer.");
  if (
    !Number.isInteger(config.memory.maxEntryCharacters) ||
    config.memory.maxEntryCharacters < 100
  )
    errors.push("memory.maxEntryCharacters must be at least 100.");
  if (
    !Number.isInteger(config.memory.retrievalLimit) ||
    config.memory.retrievalLimit < 1
  )
    errors.push("memory.retrievalLimit must be a positive integer.");
  if (
    !Number.isInteger(config.memory.injectionTokenBudget) ||
    config.memory.injectionTokenBudget < 100
  )
    errors.push("memory.injectionTokenBudget must be at least 100.");
  if (
    !Number.isInteger(config.memory.retentionDays) ||
    config.memory.retentionDays < 1
  )
    errors.push("memory.retentionDays must be a positive integer.");
  if (typeof config.pricing.remoteEnabled !== "boolean")
    errors.push("pricing.remoteEnabled must be a boolean.");
  if (typeof config.pricing.openRouterEnabled !== "boolean")
    errors.push("pricing.openRouterEnabled must be a boolean.");
  if (typeof config.pricing.liteLlmEnabled !== "boolean")
    errors.push("pricing.liteLlmEnabled must be a boolean.");
  if (
    !Number.isInteger(config.pricing.timeoutMs) ||
    config.pricing.timeoutMs < 1_000 ||
    config.pricing.timeoutMs > 60_000
  )
    errors.push("pricing.timeoutMs must be between 1000 and 60000.");
  if (
    !Number.isInteger(config.pricing.maxResponseBytes) ||
    config.pricing.maxResponseBytes < 100_000 ||
    config.pricing.maxResponseBytes > 20_000_000
  )
    errors.push(
      "pricing.maxResponseBytes must be between 100000 and 20000000.",
    );
  if (
    !Number.isFinite(config.pricing.maxSnapshotAgeHours) ||
    config.pricing.maxSnapshotAgeHours < 1
  )
    errors.push("pricing.maxSnapshotAgeHours must be at least 1.");
  const keys: string[] = [];
  for (const candidate of config.candidates) {
    if (!isObject(candidate)) {
      errors.push("Each candidate must be an object.");
      continue;
    }
    if (
      typeof candidate.provider !== "string" ||
      candidate.provider.length === 0
    )
      errors.push("Each candidate must have a non-empty provider.");
    if (typeof candidate.model !== "string" || candidate.model.length === 0)
      errors.push("Each candidate must have a non-empty model.");
    if (typeof candidate.enabled !== "boolean")
      errors.push("Each candidate must declare enabled as a boolean.");
    if (
      candidate.minimumSamples !== undefined &&
      (!Number.isInteger(candidate.minimumSamples) ||
        candidate.minimumSamples < 1)
    )
      errors.push("Candidate minimumSamples must be a positive integer.");
    if (
      candidate.priority !== undefined &&
      !Number.isFinite(candidate.priority)
    )
      errors.push("Candidate priority must be a finite number.");
    if (candidate.pricing !== undefined) {
      const pricing = candidate.pricing;
      if (
        !isObject(pricing) ||
        !Number.isFinite(pricing.inputUsdPerMillion) ||
        pricing.inputUsdPerMillion < 0 ||
        !Number.isFinite(pricing.outputUsdPerMillion) ||
        pricing.outputUsdPerMillion < 0
      ) {
        errors.push("Candidate pricing must be finite non-negative numbers.");
      }
    }
    if (
      candidate.tags !== undefined &&
      (!Array.isArray(candidate.tags) ||
        candidate.tags.some(
          (tag) => typeof tag !== "string" || tag.length === 0,
        ))
    )
      errors.push("Candidate tags must be non-empty strings.");
    if (
      candidate.workflowTags !== undefined &&
      (!Array.isArray(candidate.workflowTags) ||
        candidate.workflowTags.some(
          (tag) => typeof tag !== "string" || tag.length === 0,
        ))
    )
      errors.push("Candidate workflowTags must be non-empty strings.");
    if (
      candidate.taskTypes !== undefined &&
      (!Array.isArray(candidate.taskTypes) ||
        candidate.taskTypes.some(
          (tag) => typeof tag !== "string" || tag.length === 0,
        ))
    )
      errors.push("Candidate taskTypes must be non-empty strings.");
    if (
      Array.isArray(candidate.taskTypes) &&
      candidate.taskTypes.some((tag) => !isAllowedTaskType(tag))
    )
      errors.push(
        "Candidate taskTypes must be one of coding, vision, reading, reasoning, or fast.",
      );
    if (
      typeof candidate.provider === "string" &&
      typeof candidate.model === "string"
    )
      keys.push(`${candidate.provider}/${candidate.model}`);
  }
  if (new Set(keys).size !== keys.length)
    errors.push("Candidates must be unique by provider/model.");
  return errors;
}

const ALLOWED_TASK_TYPES = [
  "coding",
  "vision",
  "reading",
  "reasoning",
  "fast",
] as const;

type AllowedTaskType = (typeof ALLOWED_TASK_TYPES)[number];

function isAllowedTaskType(value: unknown): value is AllowedTaskType {
  return (
    typeof value === "string" &&
    (ALLOWED_TASK_TYPES as readonly string[]).includes(value)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
