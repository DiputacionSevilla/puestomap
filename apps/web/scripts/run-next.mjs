import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const rootEnv = path.resolve(appDir, "..", ".env");
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

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next", { paths: [appDir] });
const mode = process.argv[2] ?? "dev";
const child = spawn(process.execPath, [nextBin, mode], {
  stdio: "inherit",
  cwd: appDir,
  shell: false,
});
child.on("exit", (code) => process.exit(code ?? 0));
