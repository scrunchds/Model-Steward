import { buildFallbackPlan, modelKey, type HealthState } from "./fallback.js";
import { recommend } from "./recommend.js";
import type {
  ModelCandidate,
  ModelRef,
  Observation,
  Recommendation,
  StewardConfig,
  TaskFeatures,
} from "./types.js";

export interface RoutingDecision {
  readonly recommendation: Recommendation;
  readonly attempts: readonly ModelCandidate[];
  readonly shouldSwitch: boolean;
  readonly reason: string;
}

export function decideRoute(
  config: StewardConfig,
  observations: readonly Observation[],
  features: TaskFeatures,
  current: ModelRef | undefined,
  health: ReadonlyMap<string, HealthState>,
  randomUnit?: () => number,
): RoutingDecision {
  const recommendation = recommend(
    config,
    observations,
    features,
    current,
    randomUnit,
  );
  const ranked = recommendation.scores.map((score) => score.candidate);
  const plan = buildFallbackPlan(
    ranked,
    current,
    features,
    health,
    config.highRiskAllowlist,
  );
  const preferred = recommendation.selected;
  const attempts = preferred
    ? [
        preferred,
        ...plan.ordered.filter(
          (candidate) => modelKey(candidate) !== modelKey(preferred),
        ),
      ]
    : plan.ordered;
  const target = attempts[0];
  const shouldSwitch =
    (config.mode === "route" || config.mode === "auto") &&
    target !== undefined &&
    modelKey(target) !== (current ? modelKey(current) : "");
  return {
    recommendation,
    attempts,
    shouldSwitch,
    reason:
      config.mode === "observe"
        ? "Observe mode never changes the active model."
        : config.mode === "recommend"
          ? "Recommend mode reports but never changes the active model."
          : config.mode === "auto"
            ? target
              ? recommendation.reason
              : plan.reasons.join(" ")
            : target
              ? recommendation.reason
              : plan.reasons.join(" "),
  };
}
