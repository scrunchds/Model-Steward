import { execFileSync } from "node:child_process";

const scope = "model-steward.release-guard";

if (process.env.MODEL_STEWARD_RELEASE_APPROVED !== "yes") {
  log("error", "Release blocked: explicit owner approval is required.");
  process.exit(1);
}
const status = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
});
if (status.trim()) {
  log("error", "Release blocked: working tree is not clean.", {
    status: status.trim(),
  });
  process.exit(1);
}
log(
  "info",
  "Release preconditions satisfied. This command does not publish anything.",
);

function log(level, message, context) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  };
  process.stderr.write(`${JSON.stringify(record)}\n`);
}
