import { randomUUID } from "node:crypto";
import type { ModelRef, Observation, Outcome, TaskFeatures } from "./types.js";

export interface ObservationInput {
  readonly model: ModelRef;
  readonly features: TaskFeatures;
  readonly outcome?: Outcome;
  readonly latencyMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsd?: number;
  readonly source?: Observation["source"];
}

export function createObservation(
  input: ObservationInput,
  now = new Date(),
): Observation {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    timestamp: now.toISOString(),
    model: input.model,
    features: input.features,
    outcome: input.outcome ?? "unknown",
    ...(input.latencyMs === undefined
      ? {}
      : { latencyMs: nonNegative(input.latencyMs, "latencyMs") }),
    ...(input.inputTokens === undefined
      ? {}
      : { inputTokens: nonNegative(input.inputTokens, "inputTokens") }),
    ...(input.outputTokens === undefined
      ? {}
      : { outputTokens: nonNegative(input.outputTokens, "outputTokens") }),
    ...(input.costUsd === undefined
      ? {}
      : { costUsd: nonNegative(input.costUsd, "costUsd") }),
    source: input.source ?? "automatic",
  };
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be a finite non-negative number.`);
  return value;
}
