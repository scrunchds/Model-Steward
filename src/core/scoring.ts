import type {
  CandidateScore,
  ModelCandidate,
  ObjectiveWeights,
  Observation,
  TaskFeatures,
} from "./types.js";

export function scoreCandidate(
  candidate: ModelCandidate,
  observations: readonly Observation[],
  features: TaskFeatures,
  weights: ObjectiveWeights,
  minimumSamples: number,
  highRiskAllowlist: readonly string[],
): CandidateScore {
  const key = `${candidate.provider}/${candidate.model}`;
  const matching = observations.filter(
    (item) =>
      item.model.provider === candidate.provider &&
      item.model.model === candidate.model &&
      item.features.category === features.category,
  );
  const known = matching.filter((item) => item.outcome !== "unknown");
  const successes = known.filter((item) => item.outcome === "success").length;
  const quality = (successes + 1) / (known.length + 2);
  const costs = matching.flatMap((item) =>
    item.costUsd === undefined ? [] : [item.costUsd],
  );
  const latencies = matching.flatMap((item) =>
    item.latencyMs === undefined ? [] : [item.latencyMs],
  );
  const meanCostUsd = costs.length > 0 ? mean(costs) : undefined;
  const meanLatencyMs = mean(latencies);
  const confidence = Math.min(
    1,
    matching.length / Math.max(1, candidate.minimumSamples ?? minimumSamples),
  );
  const capabilityEligible =
    !features.requiresTools || candidate.supportsTools !== false;
  const eligible =
    candidate.enabled &&
    capabilityEligible &&
    (features.risk !== "high" || highRiskAllowlist.includes(key));
  const referenceCost = meanCostUsd ?? estimatedReferenceCost(candidate);
  const normalizedCost =
    referenceCost === undefined ? 0.5 : 1 / (1 + referenceCost);
  const normalizedLatency = 1 / (1 + meanLatencyMs / 1_000);
  const priorityBias = (candidate.priority ?? 0) / 10_000;
  const score =
    weights.quality * quality +
    weights.cost * normalizedCost +
    weights.latency * normalizedLatency -
    weights.uncertainty * (1 - confidence) +
    priorityBias;
  const reasons = [
    `${known.length} scored samples for ${features.category}`,
    `quality estimate ${(quality * 100).toFixed(1)}%`,
    `confidence ${(confidence * 100).toFixed(1)}%`,
    referenceCost === undefined
      ? "cost unknown"
      : `reference cost $${referenceCost.toFixed(6)} for 1K input + 500 output tokens`,
  ];
  if (!candidate.enabled) reasons.push("candidate disabled");
  if (!capabilityEligible)
    reasons.push("candidate is marked as not supporting tools");
  if (features.risk === "high" && !highRiskAllowlist.includes(key))
    reasons.push("not approved for high-risk tasks");
  return {
    candidate,
    score,
    quality,
    ...(meanCostUsd === undefined ? {} : { meanCostUsd }),
    meanLatencyMs,
    samples: matching.length,
    confidence,
    eligible,
    reasons,
  };
}

function estimatedReferenceCost(candidate: ModelCandidate): number | undefined {
  if (!candidate.pricing) return undefined;
  return (
    (1_000 * candidate.pricing.inputUsdPerMillion +
      500 * candidate.pricing.outputUsdPerMillion) /
    1_000_000
  );
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
