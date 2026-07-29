import { randomInt } from "node:crypto";
import { scoreCandidate } from "./scoring.js";
import { inferTaskType } from "./features.js";
import type {
  ModelRef,
  Observation,
  Recommendation,
  StewardConfig,
  TaskFeatures,
  TaskType,
} from "./types.js";

const TIE_EPSILON = 1e-9;

export function recommend(
  config: StewardConfig,
  observations: readonly Observation[],
  features: TaskFeatures,
  current: ModelRef | undefined,
  randomUnit = secureRandomUnit,
): Recommendation {
  const effectiveFeatures =
    config.mode === "auto"
      ? { ...features, taskType: features.taskType ?? inferTaskType(features) }
      : features;
  const scores = config.candidates
    .map((candidate) =>
      scoreCandidate(
        candidate,
        observations,
        effectiveFeatures,
        config.weights,
        config.minimumSamples,
        config.highRiskAllowlist,
      ),
    )
    .sort((left, right) => right.score - left.score);
  const workflowTags = effectiveFeatures.workflowTags ?? [];
  const requestedTaskType = effectiveFeatures.taskType;
  const taskTypeMatches = requestedTaskType
    ? scores.filter((item) => {
        return (
          item.eligible &&
          candidateMatchesTaskType(item.candidate, requestedTaskType)
        );
      })
    : [];
  const eligible = scores.filter((item) => item.eligible);
  const eligiblePool = taskTypeMatches.length > 0 ? taskTypeMatches : eligible;
  if (eligible.length === 0) {
    const currentScore = current
      ? scores.find(
          (item) =>
            item.candidate.provider === current.provider &&
            item.candidate.model === current.model,
        )
      : undefined;
    if (config.fallbackToCurrent && currentScore) {
      return {
        selected: currentScore.candidate,
        scores,
        reason:
          "No candidate is eligible for this task, so Model Steward falls back to the current model.",
        exploratory: false,
      };
    }
    return {
      scores,
      reason: "No candidate is eligible for this task.",
      exploratory: false,
    };
  }
  const underSampled = eligiblePool.filter((item) => item.confidence < 1);
  const explore =
    underSampled.length > 0 && randomUnit() < config.explorationRate;
  const selectedScore = explore
    ? underSampled[Math.floor(randomUnit() * underSampled.length)]
    : (pickWorkflowAlignedCandidate(eligiblePool, workflowTags) ??
      eligiblePool[0]);
  if (!selectedScore)
    return {
      scores,
      reason: "No candidate could be selected.",
      exploratory: false,
    };
  const currentScore = current
    ? scores.find(
        (item) =>
          item.candidate.provider === current.provider &&
          item.candidate.model === current.model,
      )
    : undefined;
  const preserveCurrentOnTie =
    config.preserveCurrentOnTie &&
    currentScore !== undefined &&
    Math.abs(selectedScore.score - currentScore.score) <= TIE_EPSILON;
  const chosen = preserveCurrentOnTie ? currentScore : selectedScore;
  return {
    selected: chosen?.candidate,
    scores,
    reason: preserveCurrentOnTie
      ? config.mode === "auto"
        ? "Auto mode preserved the current model because it tied for the top score."
        : "Preserved the current model because it tied for the top score."
      : explore
        ? config.mode === "auto"
          ? "Auto mode selected an eligible under-sampled candidate for the inferred task type."
          : "Selected an eligible under-sampled candidate for bounded exploration."
        : config.mode === "auto"
          ? "Auto mode selected the highest-scoring candidate for the inferred task type."
          : "Selected the highest risk-adjusted score.",
    exploratory: explore,
  };
}

function secureRandomUnit(): number {
  return randomInt(0, 1_000_000) / 1_000_000;
}

function pickWorkflowAlignedCandidate(
  scores: readonly ReturnType<typeof scoreCandidate>[],
  workflowTags: readonly string[],
): ReturnType<typeof scoreCandidate> | undefined {
  if (workflowTags.length === 0) return undefined;
  return scores.find((score) =>
    (score.candidate.tags ?? []).some((tag) => workflowTags.includes(tag)),
  );
}

function candidateMatchesTaskType(
  candidate: { taskTypes?: readonly TaskType[] },
  taskType: TaskType,
): boolean {
  const taskTypes = candidate.taskTypes ?? [];
  return taskTypes.length === 0 || taskTypes.includes(taskType);
}
