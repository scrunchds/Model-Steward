import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertPrivacySafeObservation } from "./privacy.js";
import { createLogger, describeError, errorContext } from "./logger.js";
import type { Observation } from "./types.js";

const storeLogger = createLogger("model-steward.store");

export class LocalObservationStore {
  public constructor(private readonly path: string) {}

  public async append(observation: Observation): Promise<void> {
    assertPrivacySafeObservation(observation);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const handle = await open(this.path, "a", 0o600);
    try {
      await handle.appendFile(`${JSON.stringify(observation)}\n`, "utf8");
    } catch (error) {
      storeLogger.error("Failed to append observation.", {
        path: this.path,
        error: describeError(error),
        ...errorContext(error),
      });
      throw error;
    } finally {
      await handle.close();
    }
  }

  public async readAll(): Promise<readonly Observation[]> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      if (isMissingFile(error)) return [];
      storeLogger.error("Failed to read observation store.", {
        path: this.path,
        error: describeError(error),
        ...errorContext(error),
      });
      throw error;
    }
    const records: Observation[] = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (isObservation(parsed)) records.push(parsed);
      } catch (error) {
        storeLogger.warn("Skipped malformed observation record.", {
          path: this.path,
          error: describeError(error),
        });
      }
    }
    return records;
  }

  public async clear(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, "", { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isObservation(value: unknown): value is Observation {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { schemaVersion?: unknown }).schemaVersion === 1 &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { timestamp?: unknown }).timestamp === "string" &&
    typeof (value as { model?: unknown }).model === "object" &&
    (value as { model?: { provider?: unknown; model?: unknown } }).model !==
      null &&
    typeof (value as { model?: { provider?: unknown } }).model?.provider ===
      "string" &&
    typeof (value as { model?: { model?: unknown } }).model?.model ===
      "string" &&
    typeof (value as { features?: unknown }).features === "object" &&
    (value as { features?: unknown }).features !== null &&
    typeof (value as { outcome?: unknown }).outcome === "string" &&
    typeof (value as { source?: unknown }).source === "string"
  );
}
