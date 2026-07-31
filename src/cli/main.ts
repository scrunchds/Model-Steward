#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { DEFAULT_CONFIG } from "../core/config.js";
import { loadConfig } from "../core/config-file.js";
import { createLogger, describeError, errorContext } from "../core/logger.js";

const logger = createLogger("model-steward.cli");
const [command = "help", argument] = process.argv.slice(2);
process.exitCode = await runCommand(command, argument);

async function runCommand(
  command: string,
  argument: string | undefined,
): Promise<number> {
  try {
    switch (command) {
      case "help":
      case "--help":
      case "-h":
        emitStdout(getHelpText());
        return 0;
      case "version":
      case "--version":
        emitStdout(await readVersion());
        return 0;
      case "validate": {
        const path = argument ?? ".model-steward/config.json";
        await loadConfig(path);
        emitStdout(`Valid Model Steward configuration: ${path}`);
        return 0;
      }
      case "defaults":
        emitStdout(JSON.stringify(DEFAULT_CONFIG, null, 2));
        return 0;
      default:
        logger.warn("Unknown CLI command.", { command });
        emitStderr(`Unknown command: ${command}`);
        emitStdout(getHelpText());
        return 2;
    }
  } catch (error) {
    reportCliFailure(command, error);
    return 1;
  }
}

function getHelpText(): string {
  return `Model Steward

Usage:
  model-steward validate [config-path]
  model-steward defaults
  model-steward version

This CLI never invokes a model, reads credentials, or sends network requests.`;
}

async function readVersion(): Promise<string> {
  const packagePath = new URL("../../package.json", import.meta.url);
  const value = JSON.parse(await readFile(packagePath, "utf8")) as {
    version?: unknown;
  };
  if (typeof value.version !== "string") {
    throw new Error("Package version is unavailable.");
  }
  return value.version;
}

function reportCliFailure(command: string, error: unknown): void {
  logger.error("CLI command failed.", {
    command,
    error: describeError(error),
    ...errorContext(error),
  });
  emitStderr(describeError(error));
}

function emitStdout(message: string): void {
  process.stdout.write(`${message}\n`);
}

function emitStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}
