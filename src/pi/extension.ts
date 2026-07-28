import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { decideCompaction } from "../core/compaction.js";
import { classifyTask } from "../core/features.js";
import { loadConfig } from "../core/config-file.js";
import { decideRoute } from "../core/router.js";
import { filterCompatibleCandidates } from "../core/provider-adapter.js";
import { LocalObservationStore } from "../core/store.js";
import { createObservation } from "../core/telemetry.js";
import {
  modelKey,
  nextHealthState,
  type HealthState,
} from "../core/fallback.js";
import type {
  ModelRef,
  Observation,
  Outcome,
  StewardConfig,
  TaskFeatures,
} from "../core/types.js";

const STATUS_KEY = "model-steward";

interface PendingTurn {
  readonly features: TaskFeatures;
  readonly model: ModelRef;
  readonly startedAt: number;
}

export default function modelStewardExtension(pi: ExtensionAPI): void {
  let config: StewardConfig | undefined;
  let store: LocalObservationStore | undefined;
  let observations: readonly Observation[] = [];
  let pending: PendingTurn | undefined;
  let lastObservation: Observation | undefined;
  let lastCompactedAt: number | undefined;
  let compactionPending = false;
  let lastTaskCompleted = false;
  const health = new Map<string, HealthState>();

  async function reload(ctx: ExtensionContext): Promise<void> {
    const globalConfigPath = join(
      process.env["USERPROFILE"] ?? process.env["HOME"] ?? "",
      ".model-steward",
      "config.json",
    );
    const globalConfig = await loadConfig(globalConfigPath);
    const configPath = join(configDirectory(ctx), "config.json");
    config = ctx.isProjectTrusted()
      ? await loadConfig(configPath, globalConfig)
      : globalConfig;
    store = new LocalObservationStore(
      join(config.localDataDirectory, "observations.jsonl"),
    );
    observations = await store.readAll();
    updateStatus(ctx);
  }

  function configDirectory(ctx: ExtensionContext): string {
    return join(ctx.cwd, ".model-steward");
  }

  function updateStatus(ctx: ExtensionContext): void {
    const mode = config?.mode ?? "observe";
    ctx.ui.setStatus(STATUS_KEY, `steward:${mode}`);
  }

  async function ensureLoaded(ctx: ExtensionContext): Promise<boolean> {
    if (config && store) return true;
    try {
      await reload(ctx);
      return true;
    } catch (error) {
      ctx.ui.notify(
        `Model Steward disabled for this session: ${messageOf(error)}`,
        "warning",
      );
      ctx.ui.setStatus(STATUS_KEY, "steward:fallback");
      return false;
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    await ensureLoaded(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const startedAt = Date.now();
    const features = classifyTask(event.prompt);
    const current = ctx.model
      ? { provider: ctx.model.provider, model: ctx.model.id }
      : undefined;
    pending = current ? { features, model: current, startedAt } : undefined;

    if (!(await ensureLoaded(ctx)) || !config) return;
    try {
      const available = ctx.modelRegistry.getAvailable().map((model) => ({
        provider: model.provider,
        id: model.id,
        input: model.input,
        contextWindow: model.contextWindow,
      }));
      const compatible = filterCompatibleCandidates(
        config.candidates,
        available,
      );
      const effectiveConfig: StewardConfig = {
        ...config,
        candidates: compatible,
      };
      const decision = decideRoute(
        effectiveConfig,
        observations,
        features,
        current,
        health,
      );
      const selected = decision.attempts[0];

      if (config.mode === "recommend" && selected) {
        ctx.ui.notify(
          `Model Steward recommends ${modelKey(selected)}: ${decision.reason}`,
          "info",
        );
      }
      if (!decision.shouldSwitch) return;

      for (const candidate of decision.attempts) {
        const model = ctx.modelRegistry.find(
          candidate.provider,
          candidate.model,
        );
        if (!model) continue;
        try {
          if (await pi.setModel(model)) {
            pending = { features, model: candidate, startedAt };
            ctx.ui.notify(
              `Model Steward selected ${modelKey(candidate)}`,
              "info",
            );
            return;
          }
        } catch (error) {
          const key = modelKey(candidate);
          health.set(key, nextHealthState(health.get(key), false));
          ctx.ui.notify(
            `Model Steward skipped ${key}: ${messageOf(error)}`,
            "warning",
          );
        }
      }
      // Fail open: when every candidate fails, Pi retains its current model.
      pending = current ? { features, model: current, startedAt } : undefined;
      ctx.ui.notify(
        "Model Steward could not activate a candidate; retaining Pi's current model.",
        "warning",
      );
    } catch (error) {
      // An optimizer failure must never prevent the user's request.
      pending = current ? { features, model: current, startedAt } : undefined;
      ctx.ui.notify(
        `Model Steward fell back to Pi's current model: ${messageOf(error)}`,
        "warning",
      );
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!pending || !store || event.message.role !== "assistant") return;
    const usage = event.message.usage;
    const observation = createObservation({
      model: pending.model,
      features: pending.features,
      outcome: event.message.stopReason === "error" ? "failure" : "unknown",
      latencyMs: Date.now() - pending.startedAt,
      inputTokens: usage.input + usage.cacheRead + usage.cacheWrite,
      outputTokens: usage.output,
      costUsd: usage.cost.total,
      source: "automatic",
    });
    try {
      await store.append(observation);
      observations = [...observations, observation];
      lastObservation = observation;
      health.set(
        modelKey(pending.model),
        nextHealthState(
          health.get(modelKey(pending.model)),
          event.message.stopReason !== "error",
        ),
      );
    } catch (error) {
      ctx.ui.notify(
        `Model Steward telemetry was not stored: ${messageOf(error)}`,
        "warning",
      );
    } finally {
      pending = undefined;
    }

    lastTaskCompleted =
      event.message.stopReason !== "error" &&
      event.message.stopReason !== "aborted";
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (
      !config ||
      compactionPending ||
      !ctx.isIdle() ||
      ctx.hasPendingMessages()
    )
      return;
    const compactDecision = decideCompaction(
      config.compaction,
      ctx.getContextUsage(),
      lastCompactedAt,
      lastTaskCompleted,
    );
    lastTaskCompleted = false;
    if (!compactDecision.shouldCompact) return;

    compactionPending = true;
    ctx.compact({
      onComplete: () => {
        lastCompactedAt = Date.now();
        compactionPending = false;
        ctx.ui.notify(
          `Model Steward compacted context: ${compactDecision.reason}`,
          "info",
        );
      },
      onError: (error) => {
        compactionPending = false;
        ctx.ui.notify(
          `Model Steward compaction failed; Pi will retain normal fallback behavior: ${error.message}`,
          "warning",
        );
      },
    });
  });

  pi.on("session_compact", () => {
    lastCompactedAt = Date.now();
    compactionPending = false;
  });

  pi.registerCommand("steward", {
    description:
      "Show Model Steward status, reload configuration, or score the last turn",
    handler: async (args, ctx) => {
      const [command, value] = args.trim().split(/\s+/, 2);
      if (command === "reload") {
        try {
          await reload(ctx);
          ctx.ui.notify(
            "Model Steward configuration and observations reloaded.",
            "info",
          );
        } catch (error) {
          ctx.ui.notify(
            `Reload failed; prior configuration remains active: ${messageOf(error)}`,
            "error",
          );
        }
        return;
      }
      if (command === "feedback") {
        if (!isOutcome(value) || value === "unknown") {
          ctx.ui.notify("Usage: /steward feedback success|failure", "warning");
          return;
        }
        if (!lastObservation || !store) {
          ctx.ui.notify("There is no recorded turn to score.", "warning");
          return;
        }
        const scored = {
          ...lastObservation,
          id: `${lastObservation.id}-feedback`,
          timestamp: new Date().toISOString(),
          outcome: value,
          source: "manual" as const,
        };
        await store.append(scored);
        observations = [...observations, scored];
        ctx.ui.notify(`Last turn scored as ${value}.`, "info");
        return;
      }
      const current = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : "none";
      ctx.ui.notify(
        `Model Steward mode=${config?.mode ?? "fallback"}; candidates=${config?.candidates.length ?? 0}; observations=${observations.length}; current=${current}`,
        "info",
      );
    },
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}

function isOutcome(value: string | undefined): value is Outcome {
  return value === "success" || value === "failure" || value === "unknown";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
