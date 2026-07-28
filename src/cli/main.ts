#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_CONFIG, validateConfig } from "../core/config.js";
import { loadConfig } from "../core/config-file.js";

const [command = "help", argument] = process.argv.slice(2);

try {
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    case "version":
    case "--version":
      await printVersion();
      break;
    case "validate": {
      const path = resolve(argument ?? ".model-steward/config.json");
      const config = await loadConfig(path);
      const errors = validateConfig(config);
      if (errors.length > 0) throw new Error(errors.join(" "));
      console.log(`Valid Model Steward configuration: ${path}`);
      break;
    }
    case "defaults":
      console.log(JSON.stringify(DEFAULT_CONFIG, null, 2));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function printHelp(): void {
  console.log(`Model Steward

Usage:
  model-steward validate [config-path]
  model-steward defaults
  model-steward version

This CLI never invokes a model, reads credentials, or sends network requests.`);
}

async function printVersion(): Promise<void> {
  const packagePath = new URL("../../package.json", import.meta.url);
  const value = JSON.parse(await readFile(packagePath, "utf8")) as {
    version?: unknown;
  };
  if (typeof value.version !== "string")
    throw new Error("Package version is unavailable.");
  console.log(value.version);
}
