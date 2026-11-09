import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.join(here, "..", ".env");
if (existsSync(rootEnv)) {
  for (const line of readFileSync(rootEnv, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("uso: node scripts/run-with-env.mjs <comando> [...args]");
  process.exit(1);
}

const require = createRequire(import.meta.url);
let command = args[0];
if (command === "tsx") {
  command = require.resolve("tsx/cli", { paths: [path.join(here, "..")] });
}

const child = spawn(process.execPath, [command, ...args.slice(1)], {
  stdio: "inherit",
  shell: false,
});
child.on("exit", (code) => process.exit(code ?? 0));
