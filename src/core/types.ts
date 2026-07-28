export type Outcome = "success" | "failure" | "unknown";

export interface ModelRef {
  readonly provider: string;
  readonly model: string;
}

export interface TaskFeatures {
  readonly category: string;
  readonly risk: "low" | "medium" | "high";
  readonly promptLengthBucket: "short" | "medium" | "long";
  readonly requiresTools: boolean;
}

export interface Observation {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly timestamp: string;
  readonly model: ModelRef;
  readonly features: TaskFeatures;
  readonly outcome: Outcome;
  readonly latencyMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsd?: number;
  readonly source: "automatic" | "manual" | "benchmark";
}

export interface ModelCandidate extends ModelRef {
  readonly enabled: boolean;
  readonly minimumSamples?: number;
  readonly priority?: number;
  readonly tags?: readonly string[];
  readonly supportsTools?: boolean;
  readonly supportsImages?: boolean;
  readonly contextWindow?: number;
}

export interface ObjectiveWeights {
  readonly quality: number;
  readonly cost: number;
  readonly latency: number;
  readonly uncertainty: number;
}

export interface CompactionPolicy {
  readonly enabled: boolean;
  readonly trigger: "threshold" | "task-complete" | "hybrid" | "manual";
  readonly thresholdPercent: number;
  readonly cooldownMinutes: number;
  readonly minimumTokens: number;
  readonly compactAfterSuccessfulTask: boolean;
}

export interface MemoryPolicy {
  readonly enabled: boolean;
  readonly maxEntries: number;
  readonly maxEntryCharacters: number;
  readonly retrievalLimit: number;
  readonly injectionTokenBudget: number;
  readonly retentionDays: number;
}

export interface StewardConfig {
  readonly mode: "observe" | "recommend" | "route";
  readonly candidates: readonly ModelCandidate[];
  readonly weights: ObjectiveWeights;
  readonly minimumSamples: number;
  readonly explorationRate: number;
  readonly highRiskAllowlist: readonly string[];
  readonly localDataDirectory: string;
  readonly preserveCurrentOnTie: boolean;
  readonly fallbackToCurrent: boolean;
  readonly compaction: CompactionPolicy;
  readonly memory: MemoryPolicy;
}

export interface CandidateScore {
  readonly candidate: ModelCandidate;
  readonly score: number;
  readonly quality: number;
  readonly meanCostUsd: number;
  readonly meanLatencyMs: number;
  readonly samples: number;
  readonly confidence: number;
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}

export interface Recommendation {
  readonly selected?: ModelCandidate;
  readonly scores: readonly CandidateScore[];
  readonly reason: string;
  readonly exploratory: boolean;
}
