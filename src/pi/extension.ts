import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AgentSettledEvent,
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  SessionShutdownEvent,
  SessionStartEvent,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { decideCompaction } from "../core/compaction.js";
import { loadConfig } from "../core/config-file.js";
import { classifyTask } from "../core/features.js";
import {
  buildFallbackPlan,
  modelKey,
  nextHealthState,
  type HealthState,
} from "../core/fallback.js";
import {
  applyPricing,
  PricingCatalog,
  snapshotAgeHours,
  type PricingSnapshot,
} from "../core/pricing.js";
import { createLogger, describeError, errorContext } from "../core/logger.js";
import { decideRoute, type RoutingDecision } from "../core/router.js";
import {
  filterCompatibleCandidates,
  type AvailableModel,
} from "../core/provider-adapter.js";
import { LocalObservationStore } from "../core/store.js";
import { createObservation } from "../core/telemetry.js";
import type {
  ModelCandidate,
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

interface RuntimeDependencies {
  readonly classifyTask: typeof classifyTask;
  readonly loadConfig: typeof loadConfig;
  readonly decideRoute: typeof decideRoute;
  readonly decideCompaction: typeof decideCompaction;
  readonly applyPricing: typeof applyPricing;
  readonly filterCompatibleCandidates: typeof filterCompatibleCandidates;
  readonly createObservation: typeof createObservation;
  readonly buildFallbackPlan: typeof buildFallbackPlan;
  readonly snapshotAgeHours: typeof snapshotAgeHours;
  readonly nextHealthState: typeof nextHealthState;
  readonly modelKey: typeof modelKey;
  readonly createLogger: typeof createLogger;
}

const DEFAULT_DEPENDENCIES: RuntimeDependencies = {
  classifyTask,
  loadConfig,
  decideRoute,
  decideCompaction,
  applyPricing,
  filterCompatibleCandidates,
  createObservation,
  buildFallbackPlan,
  snapshotAgeHours,
  nextHealthState,
  modelKey,
  createLogger,
};

function createModelStewardRuntime(
  pi: ExtensionAPI,
  dependencies: RuntimeDependencies = DEFAULT_DEPENDENCIES,
) {
  let config: StewardConfig | undefined;
  let store: LocalObservationStore | undefined;
  let pricingCatalog: PricingCatalog | undefined;
  let pricingSnapshot: PricingSnapshot | undefined;
  let observations: readonly Observation[] = [];
  let pending: PendingTurn | undefined;
  let lastObservation: Observation | undefined;
  let lastCompactedAt: number | undefined;
  let compactionPending = false;
  let lastTaskCompleted = false;
  const health = new Map<string, HealthState>();
  const log = dependencies.createLogger("model-steward.extension");

  async function handleSessionStart(
    _event: SessionStartEvent,
    ctx: ExtensionContext,
  ): Promise<void> {
    await ensureLoaded(ctx);
  }

  async function handleBeforeAgentStart(
    event: BeforeAgentStartEvent,
    ctx: ExtensionContext,
  ): Promise<void> {
    const startedAt = Date.now();
    const features = dependencies.classifyTask(event.prompt);
    const current = currentModel(ctx);
    pending = current ? { features, model: current, startedAt } : undefined;

    if (!(await ensureLoaded(ctx))) return;
    try {
      const { decision, effectiveConfig } = decideRouting(
        ctx,
        features,
        current,
      );
      const selected = decision.attempts[0];

      log.info("Routing decision prepared.", {
        mode: effectiveConfig.mode,
        selected: selected ? dependencies.modelKey(selected) : undefined,
        shouldSwitch: decision.shouldSwitch,
        attempts: decision.attempts.map((candidate) =>
          dependencies.modelKey(candidate),
        ),
        reason: decision.reason,
      });

      if (effectiveConfig.mode === "recommend" && selected) {
        ctx.ui.notify(
          `Model Steward recommends ${dependencies.modelKey(selected)}: ${decision.reason}`,
          "info",
        );
      }
      if (!decision.shouldSwitch) return;

      for (const candidate of decision.attempts) {
        const model = ctx.modelRegistry.find(
          candidate.provider,
          candidate.model,
        );
        if (!model) {
          log.warn("Candidate is missing from the active registry.", {
            candidate: dependencies.modelKey(candidate),
          });
          continue;
        }
        try {
          if (await pi.setModel(model)) {
            pending = { features, model: candidate, startedAt };
            ctx.ui.notify(
              `Model Steward selected ${dependencies.modelKey(candidate)}`,
              "info",
            );
            log.info("Model switch succeeded.", {
              candidate: dependencies.modelKey(candidate),
            });
            return;
          }
        } catch (error) {
          const key = dependencies.modelKey(candidate);
          health.set(key, dependencies.nextHealthState(health.get(key), false));
          log.warn("Model switch failed; candidate skipped.", {
            candidate: key,
            error: describeError(error),
            ...errorContext(error),
          });
          ctx.ui.notify(
            `Model Steward skipped ${key}: ${describeError(error)}`,
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
      log.warn("All routing attempts failed; retaining current model.", {
        current: current ? dependencies.modelKey(current) : undefined,
      });
    } catch (error) {
      // An optimizer failure must never prevent the user's request.
      pending = current ? { features, model: current, startedAt } : undefined;
      ctx.ui.notify(
        `Model Steward fell back to Pi's current model: ${describeError(error)}`,
        "warning",
      );
      log.error("Routing decision failed.", {
        error: describeError(error),
        ...errorContext(error),
      });
    }
  }

  async function handleTurnEnd(
    event: TurnEndEvent,
    ctx: ExtensionContext,
  ): Promise<void> {
    if (!pending || !store || event.message.role !== "assistant") return;
    const usage = event.message.usage;
    const observation = dependencies.createObservation({
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
        dependencies.modelKey(pending.model),
        dependencies.nextHealthState(
          health.get(dependencies.modelKey(pending.model)),
          event.message.stopReason !== "error",
        ),
      );
      log.info("Automatic observation stored.", {
        model: dependencies.modelKey(pending.model),
        outcome: observation.outcome,
        latencyMs: observation.latencyMs,
      });
    } catch (error) {
      ctx.ui.notify(
        `Model Steward telemetry was not stored: ${describeError(error)}`,
        "warning",
      );
      log.warn("Failed to persist automatic observation.", {
        model: dependencies.modelKey(pending.model),
        error: describeError(error),
        ...errorContext(error),
      });
    } finally {
      pending = undefined;
    }

    lastTaskCompleted =
      event.message.stopReason !== "error" &&
      event.message.stopReason !== "aborted";
  }

  function handleAgentSettled(
    _event: AgentSettledEvent,
    ctx: ExtensionContext,
  ): void {
    if (
      !config ||
      compactionPending ||
      !ctx.isIdle() ||
      ctx.hasPendingMessages()
    ) {
      return;
    }
    const compactDecision = dependencies.decideCompaction(
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
        log.info("Context compaction completed.", {
          reason: compactDecision.reason,
        });
      },
      onError: (error) => {
        compactionPending = false;
        ctx.ui.notify(
          `Model Steward compaction failed; Pi will retain normal fallback behavior: ${error.message}`,
          "warning",
        );
        log.warn("Context compaction failed.", {
          error: error.message,
          stack: error.stack,
        });
      },
    });
  }

  function handleSessionCompact(): void {
    lastCompactedAt = Date.now();
    compactionPending = false;
  }

  async function handleCommand(
    args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    try {
      const [command, value] = args.trim().split(/\s+/, 2);
      if (command === "reload") {
        await handleReloadCommand(ctx);
        return;
      }
      if (command === "pricing") {
        await handlePricingCommand(value?.trim(), ctx);
        return;
      }
      if (command === "feedback") {
        await handleFeedbackCommand(value?.trim(), ctx);
        return;
      }
      notifyStatus(ctx);
    } catch (error) {
      ctx.ui.notify(
        `Model Steward command failed: ${describeError(error)}`,
        "error",
      );
      log.error("Command handler failed.", {
        error: describeError(error),
        ...errorContext(error),
      });
    }
  }

  function handleSessionShutdown(
    _event: SessionShutdownEvent,
    ctx: ExtensionContext,
  ): void {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  async function handleReloadCommand(
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    try {
      await reload(ctx);
      ctx.ui.notify(
        "Model Steward configuration and observations reloaded.",
        "info",
      );
      log.info("Reload command completed successfully.", {
        mode: config?.mode,
        candidateCount: config?.candidates.length ?? 0,
      });
    } catch (error) {
      ctx.ui.notify(
        `Reload failed; prior configuration remains active: ${describeError(error)}`,
        "error",
      );
      log.error("Reload command failed.", {
        error: describeError(error),
        ...errorContext(error),
      });
    }
  }

  async function handlePricingCommand(
    action: string | undefined,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    if (action === "refresh") {
      if (!config || !pricingCatalog) {
        ctx.ui.notify("Model Steward is not initialized.", "warning");
        return;
      }
      if (!config.pricing.remoteEnabled) {
        ctx.ui.notify(
          "Remote pricing refresh is disabled. Set pricing.remoteEnabled=true, reload, then retry.",
          "warning",
        );
        return;
      }
      try {
        pricingSnapshot = await pricingCatalog.refresh(
          config.pricing,
          ctx.signal,
        );
        ctx.ui.notify(
          `Pricing refreshed: ${pricingSnapshot.records.length} validated model records from ${pricingSnapshot.sources.length} sources.`,
          "info",
        );
        log.info("Pricing refresh completed.", {
          records: pricingSnapshot.records.length,
          sources: pricingSnapshot.sources.length,
        });
      } catch (error) {
        ctx.ui.notify(
          `Pricing refresh failed; the prior snapshot remains active: ${describeError(error)}`,
          "error",
        );
        log.error("Pricing refresh failed.", {
          error: describeError(error),
          ...errorContext(error),
        });
      }
      return;
    }
    if (!pricingSnapshot) {
      ctx.ui.notify(
        "No pricing snapshot is available. Use /steward pricing refresh after enabling remote pricing.",
        "info",
      );
      return;
    }
    const age = dependencies.snapshotAgeHours(pricingSnapshot);
    const stale = config ? age > config.pricing.maxSnapshotAgeHours : true;
    ctx.ui.notify(
      `Pricing records=${pricingSnapshot.records.length}; sources=${pricingSnapshot.sources.length}; age=${age.toFixed(1)}h; ${stale ? "stale" : "fresh"}.`,
      stale ? "warning" : "info",
    );
  }

  async function handleFeedbackCommand(
    value: string | undefined,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    if (!isOutcome(value) || value === "unknown") {
      ctx.ui.notify("Usage: /steward feedback success|failure", "warning");
      return;
    }
    if (!lastObservation || !store) {
      ctx.ui.notify("There is no recorded turn to score.", "warning");
      return;
    }
    if (lastObservation.source === "manual") {
      ctx.ui.notify("The last turn was already scored manually.", "info");
      return;
    }
    const scored = {
      ...lastObservation,
      id: `${lastObservation.id}-feedback`,
      timestamp: new Date().toISOString(),
      outcome: value,
      source: "manual" as const,
    };
    try {
      await store.append(scored);
      observations = [...observations, scored];
      ctx.ui.notify(`Last turn scored as ${value}.`, "info");
      log.info("Manual feedback stored.", {
        outcome: value,
        observation: scored.id,
      });
    } catch (error) {
      ctx.ui.notify(
        `Model Steward could not store feedback: ${describeError(error)}`,
        "error",
      );
      log.error("Failed to store manual feedback.", {
        error: describeError(error),
        ...errorContext(error),
      });
    }
  }

  function notifyStatus(ctx: ExtensionContext): void {
    const current = currentModel(ctx);
    const currentLabel = current ? dependencies.modelKey(current) : "none";
    ctx.ui.notify(
      `Model Steward mode=${config?.mode ?? "fallback"}; candidates=${config?.candidates.length ?? 0}; observations=${observations.length}; current=${currentLabel}`,
      "info",
    );
  }

  function currentModel(ctx: ExtensionContext): ModelRef | undefined {
    return ctx.model
      ? { provider: ctx.model.provider, model: ctx.model.id }
      : undefined;
  }

  async function ensureLoaded(ctx: ExtensionContext): Promise<boolean> {
    if (config && store) return true;
    try {
      await reload(ctx);
      return true;
    } catch (error) {
      ctx.ui.notify(
        `Model Steward disabled for this session: ${describeError(error)}`,
        "warning",
      );
      ctx.ui.setStatus(STATUS_KEY, "steward:fallback");
      log.error("Runtime initialization failed.", {
        error: describeError(error),
        ...errorContext(error),
      });
      return false;
    }
  }

  async function reload(ctx: ExtensionContext): Promise<void> {
    const globalConfigPath = join(homedir(), ".model-steward", "config.json");
    const globalConfig = await dependencies.loadConfig(globalConfigPath);
    const configPath = join(configDirectory(ctx), "config.json");
    config = ctx.isProjectTrusted()
      ? await dependencies.loadConfig(configPath, globalConfig)
      : globalConfig;
    store = new LocalObservationStore(
      join(config.localDataDirectory, "observations.jsonl"),
    );
    pricingCatalog = new PricingCatalog(
      join(config.localDataDirectory, "pricing-snapshot.json"),
    );
    observations = await store.readAll();
    try {
      pricingSnapshot = await pricingCatalog.read();
    } catch (error) {
      pricingSnapshot = undefined;
      ctx.ui.notify(
        `Model Steward ignored an invalid pricing snapshot: ${describeError(error)}`,
        "warning",
      );
      log.warn("Invalid pricing snapshot ignored.", {
        error: describeError(error),
        ...errorContext(error),
      });
    }
    updateStatus(ctx);
    log.info("Runtime reloaded.", {
      mode: config.mode,
      trusted: ctx.isProjectTrusted(),
      candidates: config.candidates.length,
      observations: observations.length,
      hasPricingSnapshot: pricingSnapshot !== undefined,
    });
  }

  function configDirectory(ctx: ExtensionContext): string {
    return join(ctx.cwd, ".model-steward");
  }

  function updateStatus(ctx: ExtensionContext): void {
    const mode = config?.mode ?? "observe";
    ctx.ui.setStatus(STATUS_KEY, `steward:${mode}`);
  }

  function buildAvailableModels(
    ctx: ExtensionContext,
  ): readonly AvailableModel[] {
    return ctx.modelRegistry.getAvailable().map((model) => ({
      provider: model.provider,
      id: model.id,
      input: model.input,
      contextWindow: model.contextWindow,
    }));
  }

  function buildCompatibleCandidates(
    ctx: ExtensionContext,
  ): readonly ModelCandidate[] {
    if (!config) return [];
    const pricedCandidates = dependencies.applyPricing(
      config.candidates,
      pricingSnapshot,
      config.pricing.maxSnapshotAgeHours,
    );
    return dependencies.filterCompatibleCandidates(
      pricedCandidates,
      buildAvailableModels(ctx),
    );
  }

  function decideRouting(
    ctx: ExtensionContext,
    features: TaskFeatures,
    current: ModelRef | undefined,
  ): { decision: RoutingDecision; effectiveConfig: StewardConfig } {
    const activeConfig = assertConfig();
    const compatible = buildCompatibleCandidates(ctx);
    const effectiveConfig: StewardConfig = {
      ...activeConfig,
      candidates: compatible,
    };
    const decision = dependencies.decideRoute(
      effectiveConfig,
      observations,
      features,
      current,
      health,
    );
    if (decision.attempts.length === 0) {
      const fallback = dependencies.buildFallbackPlan(
        compatible,
        current,
        features,
        health,
        activeConfig.highRiskAllowlist,
      );
      log.warn("No routing attempts were available; fallback plan empty.", {
        reasons: fallback.reasons,
      });
    }
    return { decision, effectiveConfig };
  }

  function assertConfig(): StewardConfig {
    if (!config) throw new Error("Model Steward configuration is not loaded.");
    return config;
  }

  return {
    handleSessionStart,
    handleBeforeAgentStart,
    handleTurnEnd,
    handleAgentSettled,
    handleSessionCompact,
    handleSessionShutdown,
    handleCommand,
  };
}

export default function modelStewardExtension(pi: ExtensionAPI): void {
  const runtime = createModelStewardRuntime(pi);
  pi.on("session_start", runtime.handleSessionStart);
  pi.on("before_agent_start", runtime.handleBeforeAgentStart);
  pi.on("turn_end", runtime.handleTurnEnd);
  pi.on("agent_settled", runtime.handleAgentSettled);
  pi.on("session_compact", runtime.handleSessionCompact);
  pi.on("session_shutdown", runtime.handleSessionShutdown);

  pi.registerCommand("steward", {
    description:
      "Show status, reload configuration, inspect/refresh pricing, or score the last turn",
    handler: runtime.handleCommand,
  });
}

function isOutcome(value: string | undefined): value is Outcome {
  return value === "success" || value === "failure" || value === "unknown";
}
