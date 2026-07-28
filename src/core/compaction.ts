import type { CompactionPolicy } from "./types.js";

export interface ContextUsageSnapshot {
  readonly tokens: number | null;
  readonly contextWindow: number;
  readonly percent: number | null;
}

export interface CompactionDecision {
  readonly shouldCompact: boolean;
  readonly reason: string;
}

export function decideCompaction(
  policy: CompactionPolicy,
  usage: ContextUsageSnapshot | undefined,
  lastCompactedAt: number | undefined,
  taskCompleted = false,
  now = Date.now(),
): CompactionDecision {
  if (!policy.enabled || policy.trigger === "manual")
    return {
      shouldCompact: false,
      reason: "Automatic compaction is disabled or manual-only.",
    };
  if (!usage || usage.tokens === null || usage.percent === null) {
    return {
      shouldCompact: false,
      reason: "Context usage is not yet measurable.",
    };
  }
  if (usage.tokens < policy.minimumTokens) {
    return {
      shouldCompact: false,
      reason: `Context has fewer than ${policy.minimumTokens} tokens.`,
    };
  }
  const thresholdReached = usage.percent >= policy.thresholdPercent;
  const completedTrigger = taskCompleted && policy.compactAfterSuccessfulTask;
  const triggered =
    policy.trigger === "threshold"
      ? thresholdReached
      : policy.trigger === "task-complete"
        ? completedTrigger
        : thresholdReached || completedTrigger;
  if (!triggered) {
    return {
      shouldCompact: false,
      reason: `No configured trigger fired; context usage is ${usage.percent.toFixed(1)}%.`,
    };
  }
  const cooldownMs = policy.cooldownMinutes * 60_000;
  if (lastCompactedAt !== undefined && now - lastCompactedAt < cooldownMs) {
    return { shouldCompact: false, reason: "Compaction cooldown is active." };
  }
  const reason = completedTrigger
    ? `A successful task completed with context usage at ${usage.percent.toFixed(1)}%.`
    : `Context usage ${usage.percent.toFixed(1)}% reached threshold ${policy.thresholdPercent}%.`;
  return { shouldCompact: true, reason };
}
