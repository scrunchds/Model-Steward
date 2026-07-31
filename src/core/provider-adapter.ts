import type { ModelCandidate, TaskType } from "./types.js";

export interface AvailableModel {
  readonly provider: string;
  readonly id: string;
  readonly input?: readonly string[];
  readonly contextWindow?: number;
}

export interface DiscoveryPolicy {
  readonly providerAllowlist: readonly string[];
  readonly modelAllowPatterns: readonly string[];
  readonly defaultEnabled: boolean;
  readonly maximumCandidates: number;
}

export interface CandidateResolution {
  readonly candidate: ModelCandidate;
  readonly available?: AvailableModel;
  readonly compatible: boolean;
  readonly reasons: readonly string[];
}

export function resolveCandidate(
  candidate: ModelCandidate,
  availableModels: readonly AvailableModel[],
): CandidateResolution {
  const available = findAvailableModel(candidate, availableModels);
  const reasons = compatibilityReasons(candidate, available);
  return {
    candidate,
    ...(available ? { available } : {}),
    compatible: available !== undefined && reasons.length === 0,
    reasons,
  };
}

export function filterCompatibleCandidates(
  candidates: readonly ModelCandidate[],
  availableModels: readonly AvailableModel[],
): readonly ModelCandidate[] {
  return candidates.filter(
    (candidate) => resolveCandidate(candidate, availableModels).compatible,
  );
}

export function discoverCandidates(
  availableModels: readonly AvailableModel[],
  policy: DiscoveryPolicy,
): readonly ModelCandidate[] {
  validateDiscoveryPolicy(policy);
  const patterns = compilePatterns(policy.modelAllowPatterns);
  return availableModels
    .filter((model) => isProviderAllowed(model, policy.providerAllowlist))
    .filter((model) => matchesAnyPattern(model.id, patterns))
    .sort(compareAvailableModels)
    .slice(0, policy.maximumCandidates)
    .map((model) => buildCandidate(model, policy.defaultEnabled));
}

function findAvailableModel(
  candidate: ModelCandidate,
  availableModels: readonly AvailableModel[],
): AvailableModel | undefined {
  return availableModels.find(
    (model) =>
      model.provider === candidate.provider && model.id === candidate.model,
  );
}

function compatibilityReasons(
  candidate: ModelCandidate,
  available: AvailableModel | undefined,
): string[] {
  const reasons: string[] = [];
  if (!available) {
    reasons.push(
      "model is absent from the host model registry or lacks configured authentication",
    );
    return reasons;
  }
  if (candidate.supportsImages && !available.input?.includes("image"))
    reasons.push(
      "candidate requires image support but the registered model does not advertise it",
    );
  if (
    candidate.contextWindow &&
    available.contextWindow &&
    available.contextWindow < candidate.contextWindow
  ) {
    reasons.push(
      `registered context window ${available.contextWindow} is below required ${candidate.contextWindow}`,
    );
  }
  return reasons;
}

function validateDiscoveryPolicy(policy: DiscoveryPolicy): void {
  if (
    !Number.isInteger(policy.maximumCandidates) ||
    policy.maximumCandidates < 0
  ) {
    throw new Error("maximumCandidates must be a non-negative integer.");
  }
}

function compilePatterns(patterns: readonly string[]): readonly RegExp[] {
  return patterns.map(globToRegExp);
}

function isProviderAllowed(
  model: AvailableModel,
  allowlist: readonly string[],
): boolean {
  return allowlist.length === 0 || allowlist.includes(model.provider);
}

function matchesAnyPattern(id: string, patterns: readonly RegExp[]): boolean {
  return patterns.length === 0 || patterns.some((pattern) => pattern.test(id));
}

function compareAvailableModels(
  left: AvailableModel,
  right: AvailableModel,
): number {
  return `${left.provider}/${left.id}`.localeCompare(
    `${right.provider}/${right.id}`,
  );
}

function buildCandidate(
  model: AvailableModel,
  defaultEnabled: boolean,
): ModelCandidate {
  const taskTypes = inferTaskTypes(model);
  return {
    provider: model.provider,
    model: model.id,
    enabled: defaultEnabled,
    supportsImages: model.input?.includes("image") ?? false,
    ...(model.contextWindow === undefined
      ? {}
      : { contextWindow: model.contextWindow }),
    tags: ["discovered", model.provider, model.id],
    workflowTags: inferWorkflowTags(model),
    ...(taskTypes.length === 0 ? {} : { taskTypes }),
  };
}

function inferWorkflowTags(model: AvailableModel): readonly string[] {
  const tags = new Set<string>(["discovered", model.provider, model.id]);
  if (model.input?.includes("image")) tags.add("vision");
  if ((model.contextWindow ?? 0) >= 64_000) tags.add("reading");
  if ((model.contextWindow ?? 0) < 16_000) tags.add("fast");
  return [...tags];
}

function inferTaskTypes(model: AvailableModel): readonly TaskType[] {
  const tags = new Set<string>();
  const id = model.id.toLowerCase();
  if (
    model.input?.includes("image") ||
    id.includes("vision") ||
    id.includes("image")
  )
    tags.add("vision");
  if (
    id.includes("coder") ||
    id.includes("code") ||
    id.includes("dev") ||
    id.includes("program")
  )
    tags.add("coding");
  if ((model.contextWindow ?? 0) >= 64_000) tags.add("reading");
  if ((model.contextWindow ?? 0) < 16_000) tags.add("fast");
  if (tags.size === 0) tags.add("reasoning");
  return [...tags] as TaskType[];
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "u");
}
