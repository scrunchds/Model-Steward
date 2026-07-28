import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Observation } from "./types.js";
import { assertPrivacySafeObservation } from "./privacy.js";

export class LocalObservationStore {
  public constructor(private readonly path: string) {}

  public async append(observation: Observation): Promise<void> {
    assertPrivacySafeObservation(observation);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const handle = await open(this.path, "a", 0o600);
    try {
      await handle.appendFile(`${JSON.stringify(observation)}\n`, "utf8");
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
      throw error;
    }
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Observation);
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
