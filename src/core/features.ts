import type { TaskFeatures, TaskType } from "./types.js";

const HIGH_RISK =
  /\b(release|publish|deploy|production|credential|secret|security|vulnerab|delete|migration|payment)\b/i;
const MEDIUM_RISK =
  /\b(refactor|dependency|upgrade|database|workflow|permission|authentication|authorization)\b/i;

export function classifyTask(prompt: string): TaskFeatures {
  const normalized = prompt.trim();
  const length = normalized.length;
  return {
    category: classifyCategory(normalized),
    taskType: inferTaskType(normalized),
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

export function inferTaskType(
  input:
    | string
    | Pick<
        TaskFeatures,
        "category" | "requiresTools" | "promptLengthBucket" | "risk"
      >,
): TaskType {
  return typeof input === "string"
    ? inferTaskTypeFromPrompt(input.trim())
    : inferTaskTypeFromFeatures(input);
}

function inferTaskTypeFromFeatures(
  features: Pick<
    TaskFeatures,
    "category" | "requiresTools" | "promptLengthBucket" | "risk"
  >,
): TaskType {
  if (
    features.category === "documentation" ||
    features.promptLengthBucket === "long"
  )
    return "reading";
  if (features.requiresTools && features.category !== "documentation")
    return "coding";
  if (features.risk === "high") return "reasoning";
  return "fast";
}

function inferTaskTypeFromPrompt(prompt: string): TaskType {
  if (
    /\b(image|picture|photo|screenshot|diagram|visual|ocr|canvas)\b/i.test(
      prompt,
    )
  )
    return "vision";
  if (
    /\b(code|refactor|implement|function|class |api |endpoint|bug|fix|debug|compile|build|deploy|ci|cd|pipeline|test suite)\b/i.test(
      prompt,
    )
  )
    return "coding";
  if (
    /\b(summarize|summarise|extract|read|analyze this|review this|scan|overview|digest|condense)\b/i.test(
      prompt,
    ) &&
    prompt.length > 500
  )
    return "reading";
  if (
    /\b(analyze|reason|think|plan|strategy|evaluate|compare|contrast|why|how|explain|what if|consider|decide)\b/i.test(
      prompt,
    )
  )
    return "reasoning";
  if (
    prompt.length < 200 &&
    !/\b(complex|detailed|comprehensive|thorough)\b/i.test(prompt)
  )
    return "fast";
  return "reasoning";
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
