import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ModelCandidate, PricingPolicy } from "./types.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/models";
const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

export interface PriceRecord {
  readonly provider: string;
  readonly model: string;
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly supportsTools?: boolean;
  readonly supportsImages?: boolean;
  readonly source: "manual" | "openrouter" | "litellm";
  readonly sourceUrl?: string;
  readonly retrievedAt: string;
}

export interface PricingSnapshot {
  readonly schemaVersion: 1;
  readonly retrievedAt: string;
  readonly records: readonly PriceRecord[];
  readonly sources: readonly { url: string; sha256: string }[];
}

export class PricingCatalog {
  public constructor(private readonly path: string) {}

  public async read(): Promise<PricingSnapshot | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as unknown;
      return validateSnapshot(parsed);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return undefined;
      throw error;
    }
  }

  public async refresh(
    policy: PricingPolicy,
    signal?: AbortSignal,
  ): Promise<PricingSnapshot> {
    if (!policy.remoteEnabled)
      throw new Error("Remote pricing is disabled by local policy.");
    const records: PriceRecord[] = [];
    const sources: { url: string; sha256: string }[] = [];
    const retrievedAt = new Date().toISOString();

    if (policy.openRouterEnabled) {
      const body = await fetchBounded(OPENROUTER_URL, policy, signal);
      records.push(...parseOpenRouter(body, retrievedAt));
      sources.push({ url: OPENROUTER_URL, sha256: sha256(body) });
    }
    if (policy.liteLlmEnabled) {
      const body = await fetchBounded(LITELLM_URL, policy, signal);
      records.push(...parseLiteLlm(body, retrievedAt));
      sources.push({ url: LITELLM_URL, sha256: sha256(body) });
    }
    if (sources.length === 0)
      throw new Error("No remote pricing source is enabled.");

    const snapshot: PricingSnapshot = {
      schemaVersion: 1,
      retrievedAt,
      records: deduplicate(records),
      sources,
    };
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, this.path);
    return snapshot;
  }
}

export function applyPricing(
  candidates: readonly ModelCandidate[],
  snapshot: PricingSnapshot | undefined,
): readonly ModelCandidate[] {
  if (!snapshot) return candidates;
  return candidates.map((candidate) => {
    if (candidate.pricing) return candidate;
    const record = snapshot.records.find(
      (item) =>
        item.provider === candidate.provider && item.model === candidate.model,
    );
    if (!record) return candidate;
    const supportsTools = candidate.supportsTools ?? record.supportsTools;
    const supportsImages = candidate.supportsImages ?? record.supportsImages;
    const contextWindow = candidate.contextWindow ?? record.contextWindow;
    return {
      ...candidate,
      pricing: {
        inputUsdPerMillion: record.inputUsdPerMillion,
        outputUsdPerMillion: record.outputUsdPerMillion,
      },
      ...(supportsTools === undefined ? {} : { supportsTools }),
      ...(supportsImages === undefined ? {} : { supportsImages }),
      ...(contextWindow === undefined ? {} : { contextWindow }),
    };
  });
}

export function snapshotAgeHours(
  snapshot: PricingSnapshot,
  now = Date.now(),
): number {
  return Math.max(
    0,
    (now - new Date(snapshot.retrievedAt).getTime()) / 3_600_000,
  );
}

export function estimateCost(
  candidate: ModelCandidate,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  if (!candidate.pricing) return undefined;
  return (
    (inputTokens * candidate.pricing.inputUsdPerMillion +
      outputTokens * candidate.pricing.outputUsdPerMillion) /
    1_000_000
  );
}

function parseOpenRouter(body: string, retrievedAt: string): PriceRecord[] {
  const root = JSON.parse(body) as { data?: unknown };
  if (!Array.isArray(root.data))
    throw new Error("OpenRouter pricing response has no data array.");
  return root.data.flatMap((value): PriceRecord[] => {
    if (
      !isObject(value) ||
      typeof value["id"] !== "string" ||
      !isObject(value["pricing"])
    )
      return [];
    const input = perMillion(value["pricing"]["prompt"]);
    const output = perMillion(value["pricing"]["completion"]);
    if (input === undefined || output === undefined) return [];
    const params = Array.isArray(value["supported_parameters"])
      ? value["supported_parameters"]
      : [];
    const architecture = isObject(value["architecture"])
      ? value["architecture"]
      : {};
    const modalities = Array.isArray(architecture["input_modalities"])
      ? architecture["input_modalities"]
      : [];
    return [
      {
        provider: "openrouter",
        model: value["id"],
        inputUsdPerMillion: input,
        outputUsdPerMillion: output,
        ...optionalPositive("contextWindow", value["context_length"]),
        supportsTools: params.includes("tools"),
        supportsImages: modalities.includes("image"),
        source: "openrouter",
        sourceUrl: OPENROUTER_URL,
        retrievedAt,
      },
    ];
  });
}

function parseLiteLlm(body: string, retrievedAt: string): PriceRecord[] {
  const root = JSON.parse(body) as unknown;
  if (!isObject(root))
    throw new Error("LiteLLM pricing response must be an object.");
  const records: PriceRecord[] = [];
  for (const [key, value] of Object.entries(root)) {
    if (key === "sample_spec" || !isObject(value) || isVariablePriceModel(key))
      continue;
    const input = perTokenToMillion(value["input_cost_per_token"]);
    const output = perTokenToMillion(value["output_cost_per_token"]);
    if (input === undefined || output === undefined) continue;
    const split = splitLiteLlmKey(key, value);
    if (!split) continue;
    records.push({
      ...split,
      inputUsdPerMillion: input,
      outputUsdPerMillion: output,
      ...optionalPositive("contextWindow", value["max_input_tokens"]),
      ...optionalPositive("maxOutputTokens", value["max_output_tokens"]),
      source: "litellm",
      sourceUrl: LITELLM_URL,
      retrievedAt,
    });
  }
  return records;
}

function splitLiteLlmKey(
  key: string,
  value: Record<string, unknown>,
): { provider: string; model: string } | undefined {
  if (key.startsWith("openrouter/"))
    return { provider: "openrouter", model: key.slice("openrouter/".length) };
  const provider =
    typeof value["litellm_provider"] === "string"
      ? value["litellm_provider"]
      : undefined;
  if (!provider) return undefined;
  const prefix = `${provider}/`;
  return {
    provider,
    model: key.startsWith(prefix) ? key.slice(prefix.length) : key,
  };
}

function isVariablePriceModel(key: string): boolean {
  return (
    key === "openrouter/openrouter/auto" ||
    key === "openrouter/openrouter/auto-beta"
  );
}

function deduplicate(records: readonly PriceRecord[]): PriceRecord[] {
  const result = new Map<string, PriceRecord>();
  for (const record of records) {
    const key = `${record.provider}\0${record.model}`;
    if (!result.has(key) || record.source === "openrouter")
      result.set(key, record);
  }
  return [...result.values()];
}

async function fetchBounded(
  url: string,
  policy: PricingPolicy,
  outerSignal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
  const abort = () => controller.abort();
  outerSignal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "model-steward/0.1",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        `Pricing source ${url} returned HTTP ${response.status}.`,
      );
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > policy.maxResponseBytes)
      throw new Error(`Pricing source ${url} exceeds the response limit.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > policy.maxResponseBytes)
      throw new Error(`Pricing source ${url} exceeds the response limit.`);
    return new TextDecoder().decode(bytes);
  } finally {
    clearTimeout(timeout);
    outerSignal?.removeEventListener("abort", abort);
  }
}

function validateSnapshot(value: unknown): PricingSnapshot {
  if (
    !isObject(value) ||
    value["schemaVersion"] !== 1 ||
    typeof value["retrievedAt"] !== "string" ||
    !Array.isArray(value["records"]) ||
    !Array.isArray(value["sources"])
  ) {
    throw new Error("Pricing snapshot is invalid.");
  }
  for (const record of value["records"]) {
    if (
      !isObject(record) ||
      typeof record["provider"] !== "string" ||
      typeof record["model"] !== "string" ||
      !isNonNegative(record["inputUsdPerMillion"]) ||
      !isNonNegative(record["outputUsdPerMillion"])
    ) {
      throw new Error("Pricing snapshot contains an invalid record.");
    }
  }
  return value as unknown as PricingSnapshot;
}

function perMillion(value: unknown): number | undefined {
  const numeric =
    typeof value === "string" || typeof value === "number"
      ? Number(value)
      : Number.NaN;
  return isNonNegative(numeric) ? numeric * 1_000_000 : undefined;
}
function perTokenToMillion(value: unknown): number | undefined {
  return typeof value === "number" && isNonNegative(value)
    ? value * 1_000_000
    : undefined;
}
function optionalPositive<Name extends "contextWindow" | "maxOutputTokens">(
  name: Name,
  value: unknown,
): Partial<Record<Name, number>> {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? ({ [name]: value } as Record<Name, number>)
    : {};
}
function isNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
