import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let cached: Record<string, string> | null = null;

function readEnvFile(): Record<string, string> {
  if (cached) return cached;
  cached = {};
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const file = path.join(dir, ".env");
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq > 0) cached[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cached;
}

export function envValue(name: string): string | undefined {
  const runtime: Record<string, string | undefined> = process.env;
  return runtime[name] || readEnvFile()[name];
}
