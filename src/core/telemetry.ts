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
    ...optionalMetric("latencyMs", input.latencyMs),
    ...optionalMetric("inputTokens", input.inputTokens),
    ...optionalMetric("outputTokens", input.outputTokens),
    ...optionalMetric("costUsd", input.costUsd),
    source: input.source ?? "automatic",
  };
}

function optionalMetric<
  Name extends "latencyMs" | "inputTokens" | "outputTokens" | "costUsd",
>(name: Name, value: number | undefined): Partial<Record<Name, number>> {
  // Provider SDKs occasionally report NaN, Infinity, or sentinel negative costs.
  // Optional telemetry must never block the host agent, so omit unusable values.
  return value === undefined || !Number.isFinite(value) || value < 0
    ? {}
    : ({ [name]: value } as Record<Name, number>);
}
