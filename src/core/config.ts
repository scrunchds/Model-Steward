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
};

export function validateConfig(config: StewardConfig): readonly string[] {
  const errors: string[] = [];
  const weights = Object.values(config.weights);
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    errors.push("Objective weights must be finite non-negative numbers.");
  }
  if (weights.reduce((sum, weight) => sum + weight, 0) <= 0)
    errors.push("At least one objective weight must be positive.");
  if (!Number.isInteger(config.minimumSamples) || config.minimumSamples < 1)
    errors.push("minimumSamples must be a positive integer.");
  if (config.explorationRate < 0 || config.explorationRate > 1)
    errors.push("explorationRate must be between 0 and 1.");
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
  const keys = config.candidates.map(
    (candidate) => `${candidate.provider}/${candidate.model}`,
  );
  if (new Set(keys).size !== keys.length)
    errors.push("Candidates must be unique by provider/model.");
  return errors;
}
