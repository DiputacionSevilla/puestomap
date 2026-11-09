import { spawn } from "node:child_process";

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
