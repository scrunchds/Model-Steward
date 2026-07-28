export {
  decideCompaction,
  type CompactionDecision,
  type ContextUsageSnapshot,
} from "./core/compaction.js";
export { loadConfig } from "./core/config-file.js";
export { DEFAULT_CONFIG, validateConfig } from "./core/config.js";
export {
  buildFallbackPlan,
  modelKey,
  nextHealthState,
  type FallbackPlan,
  type HealthState,
} from "./core/fallback.js";
export { classifyTask } from "./core/features.js";
export {
  assertPrivacySafeObservation,
  hashIdentifier,
} from "./core/privacy.js";
export {
  discoverCandidates,
  filterCompatibleCandidates,
  resolveCandidate,
  type AvailableModel,
  type CandidateResolution,
  type DiscoveryPolicy,
} from "./core/provider-adapter.js";
export { recommend } from "./core/recommend.js";
export { decideRoute, type RoutingDecision } from "./core/router.js";
export { scoreCandidate } from "./core/scoring.js";
export { LocalObservationStore } from "./core/store.js";
export { createObservation, type ObservationInput } from "./core/telemetry.js";
export type * from "./core/types.js";
