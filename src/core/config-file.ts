import { readFile } from "node:fs/promises";
import { DEFAULT_CONFIG, validateConfig } from "./config.js";
import type { StewardConfig } from "./types.js";

export async function loadConfig(path: string): Promise<StewardConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) return DEFAULT_CONFIG;
    throw new Error(
      `Unable to load model steward config: ${messageOf(error)}`,
      { cause: error },
    );
  }
  if (!isObject(parsed))
    throw new Error("Model steward config must be a JSON object.");
  const candidate = mergeConfig(parsed);
  const errors = validateConfig(candidate);
  if (errors.length > 0)
    throw new Error(`Invalid model steward config: ${errors.join(" ")}`);
  return candidate;
}

function mergeConfig(input: Record<string, unknown>): StewardConfig {
  return {
    ...DEFAULT_CONFIG,
    ...input,
    weights: {
      ...DEFAULT_CONFIG.weights,
      ...(isObject(input["weights"]) ? input["weights"] : {}),
    },
    compaction: {
      ...DEFAULT_CONFIG.compaction,
      ...(isObject(input["compaction"]) ? input["compaction"] : {}),
    },
    memory: {
      ...DEFAULT_CONFIG.memory,
      ...(isObject(input["memory"]) ? input["memory"] : {}),
    },
    candidates: Array.isArray(input["candidates"])
      ? (input["candidates"] as StewardConfig["candidates"])
      : DEFAULT_CONFIG.candidates,
    highRiskAllowlist: Array.isArray(input["highRiskAllowlist"])
      ? (input["highRiskAllowlist"] as readonly string[])
      : DEFAULT_CONFIG.highRiskAllowlist,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
