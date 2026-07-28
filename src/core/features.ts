import type { TaskFeatures } from "./types.js";

const HIGH_RISK =
  /\b(release|publish|deploy|production|credential|secret|security|vulnerab|delete|migration|payment)\b/i;
const MEDIUM_RISK =
  /\b(refactor|dependency|upgrade|database|workflow|permission|authentication|authorization)\b/i;

export function classifyTask(prompt: string): TaskFeatures {
  const normalized = prompt.trim();
  const length = normalized.length;
  return {
    category: classifyCategory(normalized),
    risk: HIGH_RISK.test(normalized)
      ? "high"
      : MEDIUM_RISK.test(normalized)
        ? "medium"
        : "low",
    promptLengthBucket:
      length < 500 ? "short" : length < 3_000 ? "medium" : "long",
    requiresTools:
      /\b(file|repository|repo|code|test|build|git|github|command|terminal|inspect|edit|fix)\b/i.test(
        normalized,
      ),
  };
}

function classifyCategory(prompt: string): string {
  if (/\b(security|vulnerab|codeql|secret|permission|auth)\b/i.test(prompt))
    return "security";
  if (/\b(test|failure|bug|debug|fix)\b/i.test(prompt)) return "debugging";
  if (/\b(document|readme|guide|changelog)\b/i.test(prompt))
    return "documentation";
  if (/\b(dependency|upgrade|dependabot|package)\b/i.test(prompt))
    return "dependencies";
  if (/\b(review|pull request|pr|audit)\b/i.test(prompt)) return "review";
  if (/\b(implement|build|create|refactor|code)\b/i.test(prompt))
    return "implementation";
  return "general";
}
