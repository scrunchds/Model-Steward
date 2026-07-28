import { spawnSync } from "node:child_process";

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.toLowerCase() === "npm_config_allow_scripts") delete env[key];
}
const npmCli = process.env["npm_execpath"];
if (!npmCli)
  throw new Error("npm_execpath is unavailable; run this script through npm.");
const result = spawnSync(
  process.execPath,
  [npmCli, "audit", "--audit-level=moderate"],
  {
    env,
    stdio: "inherit",
    shell: false,
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
