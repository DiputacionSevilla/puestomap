import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const targets = ["apps/web", "apps/gateway", "apps/worker"];
const children = [];

for (const ws of targets) {
  const child = spawn(npm, ["run", "dev", "-w", ws], {
    stdio: "inherit",
    shell: false,
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${ws} terminó con código ${code}`);
    }
  });
  children.push(child);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
