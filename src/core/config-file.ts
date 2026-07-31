import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, validateConfig } from "./config.js";
import type { StewardConfig } from "./types.js";

export async function loadConfig(
  path: string,
  base: StewardConfig = DEFAULT_CONFIG,
): Promise<StewardConfig> {
  const resolvedPath = expandHome(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(resolvedPath, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) return base;
    throw new Error(
      `Unable to load model steward config at ${resolvedPath}: ${messageOf(error)}`,
      { cause: error },
    );
  }
  if (!isObject(parsed)) {
    throw new Error(
      `Model steward config must be a JSON object. Path: ${resolvedPath}.`,
    );
  }
  const candidate = mergeConfig(parsed, base);
  const errors = validateConfig(candidate);
  if (errors.length > 0) {
    throw new Error(
      `Invalid model steward config at ${resolvedPath}: ${errors.join(" ")}`,
    );
  }
  return candidate;
}

function mergeConfig(
  input: Record<string, unknown>,
  base: StewardConfig,
): StewardConfig {
  return {
    ...base,
    ...input,
    weights: {
      ...base.weights,
      ...(isObject(input["weights"]) ? input["weights"] : {}),
    },
    compaction: {
      ...base.compaction,
      ...(isObject(input["compaction"]) ? input["compaction"] : {}),
    },
    memory: {
      ...base.memory,
      ...(isObject(input["memory"]) ? input["memory"] : {}),
    },
    pricing: {
      ...base.pricing,
      ...(isObject(input["pricing"]) ? input["pricing"] : {}),
    },
    candidates: Array.isArray(input["candidates"])
      ? (input["candidates"] as StewardConfig["candidates"])
      : base.candidates,
    highRiskAllowlist: Array.isArray(input["highRiskAllowlist"])
      ? (input["highRiskAllowlist"] as readonly string[])
      : base.highRiskAllowlist,
  };
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
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
