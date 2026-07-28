import { randomInt } from "node:crypto";
import { scoreCandidate } from "./scoring.js";
import type {
  Observation,
  Recommendation,
  StewardConfig,
  TaskFeatures,
} from "./types.js";

export function recommend(
  config: StewardConfig,
  observations: readonly Observation[],
  features: TaskFeatures,
  randomUnit = secureRandomUnit,
): Recommendation {
  const scores = config.candidates
    .map((candidate) =>
      scoreCandidate(
        candidate,
        observations,
        features,
        config.weights,
        config.minimumSamples,
        config.highRiskAllowlist,
      ),
    )
    .sort((left, right) => right.score - left.score);
  const eligible = scores.filter((item) => item.eligible);
  if (eligible.length === 0)
    return {
      scores,
      reason: "No candidate is eligible for this task.",
      exploratory: false,
    };
  const underSampled = eligible.filter((item) => item.confidence < 1);
  const explore =
    underSampled.length > 0 && randomUnit() < config.explorationRate;
  const selectedScore = explore
    ? underSampled[Math.floor(randomUnit() * underSampled.length)]
    : eligible[0];
  if (!selectedScore)
    return {
      scores,
      reason: "No candidate could be selected.",
      exploratory: false,
    };
  return {
    selected: selectedScore.candidate,
    scores,
    reason: explore
      ? "Selected an eligible under-sampled candidate for bounded exploration."
      : "Selected the highest risk-adjusted score.",
    exploratory: explore,
  };
}

function secureRandomUnit(): number {
  return randomInt(0, 1_000_000) / 1_000_000;
}
