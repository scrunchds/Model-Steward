import type { ModelCandidate, ModelRef, TaskFeatures } from "./types.js";

export interface HealthState {
  readonly consecutiveFailures: number;
  readonly unavailableUntil?: string;
}

export interface FallbackPlan {
  readonly ordered: readonly ModelCandidate[];
  readonly reasons: readonly string[];
}

export function buildFallbackPlan(
  ranked: readonly ModelCandidate[],
  current: ModelRef | undefined,
  features: TaskFeatures,
  health: ReadonlyMap<string, HealthState>,
  highRiskAllowlist: readonly string[],
  now = new Date(),
): FallbackPlan {
  const reasons: string[] = [];
  const usable = ranked.filter((candidate) => {
    const key = modelKey(candidate);
    const state = health.get(key);
    if (!candidate.enabled) return false;
    if (features.risk === "high" && !highRiskAllowlist.includes(key))
      return false;
    if (state?.unavailableUntil && new Date(state.unavailableUntil) > now) {
      reasons.push(
        `${key} skipped by circuit breaker until ${state.unavailableUntil}`,
      );
      return false;
    }
    return true;
  });
  const currentCandidate = current
    ? usable.find((candidate) => modelKey(candidate) === modelKey(current))
    : undefined;
  const ordered = currentCandidate
    ? [
        currentCandidate,
        ...usable.filter((candidate) => candidate !== currentCandidate),
      ]
    : usable;
  if (ordered.length === 0)
    reasons.push(
      "No configured candidate is currently safe and healthy; keep Pi's existing model.",
    );
  return { ordered, reasons };
}

export function nextHealthState(
  previous: HealthState | undefined,
  succeeded: boolean,
  now = new Date(),
): HealthState {
  if (succeeded) return { consecutiveFailures: 0 };
  const failures = (previous?.consecutiveFailures ?? 0) + 1;
  if (failures < 3) return { consecutiveFailures: failures };
  const backoffMinutes = Math.min(60, 2 ** Math.min(5, failures - 3));
  return {
    consecutiveFailures: failures,
    unavailableUntil: new Date(
      now.getTime() + backoffMinutes * 60_000,
    ).toISOString(),
  };
}

export function modelKey(model: ModelRef): string {
  return `${model.provider}/${model.model}`;
}
