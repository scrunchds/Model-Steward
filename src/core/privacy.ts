import { createHash } from "node:crypto";
import type { Observation } from "./types.js";

export function hashIdentifier(value: string, salt: string): string {
  return createHash("sha256")
    .update(salt)
    .update("\0")
    .update(value)
    .digest("hex");
}

export function assertPrivacySafeObservation(observation: Observation): void {
  const serialized = JSON.stringify(observation);
  const forbidden = [
    /sk-[A-Za-z0-9_-]{16,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(?:password|api[_-]?key|authorization)\s*[:=]/i,
  ];
  if (forbidden.some((pattern) => pattern.test(serialized))) {
    throw new Error(
      "Observation contains secret-like material and was not stored.",
    );
  }
}
