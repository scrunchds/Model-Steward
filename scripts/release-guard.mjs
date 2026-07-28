import { execFileSync } from "node:child_process";

if (process.env.MODEL_STEWARD_RELEASE_APPROVED !== "yes") {
  console.error("Release blocked: explicit owner approval is required.");
  process.exit(1);
}
const status = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
});
if (status.trim()) {
  console.error("Release blocked: working tree is not clean.");
  process.exit(1);
}
console.log(
  "Release preconditions satisfied. This command does not publish anything.",
);
