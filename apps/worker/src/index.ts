import cron from "node-cron";
import { getPrisma } from "@puestomap/db";
import { discoverScreenCandidates } from "./screens.js";
import http from "node:http";
import { cleanupStaleSessions } from "./cleanup.js";
import { runProbe } from "./probe.js";
import { runGlpiSync } from "./sync/glpi.js";

export const WORKER_VERSION = "1.0.0";

let glpiRunning = false;
let probeRunning = false;

function log(event: string, data: Record<string, unknown> = {}) {
  if (["warn", "error"].includes(process.env.LOG_LEVEL ?? "info")) return;
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    service: "worker",
    event,
    ...data,
  }));
}

async function guardedGlpiSync() {
  if (glpiRunning) return false;
  glpiRunning = true;
  try {
    await runGlpiSync();
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "glpi.sync.failed", error: error instanceof Error ? error.message : String(error) }));
  } finally {
    glpiRunning = false;
  }
  return true;
}

async function guardedProbe() {
  if (probeRunning) return;
  probeRunning = true;
  try {
    await runProbe();
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "probe.failed", error: error instanceof Error ? error.message : String(error) }));
  } finally {
    probeRunning = false;
  }
}

export function startWorker() {
  const prisma = getPrisma();
  const interval = Math.max(1, Math.min(59, Number(process.env.PROBE_INTERVAL_MIN ?? 5) || 5));
  cron.schedule(`*/${interval} * * * *`, () => void guardedProbe());
  if (process.env.GLPI_URL && process.env.GLPI_TOKEN) {
    cron.schedule(process.env.GLPI_SYNC_CRON ?? "*/30 * * * *", () => void guardedGlpiSync());
    cron.schedule("*/30 * * * * *", () => void (async () => {
      const [requested, handled] = await Promise.all([
        prisma.setting.findUnique({ where: { key: "glpi.requestedAt" } }),
        prisma.setting.findUnique({ where: { key: "glpi.handledRequestAt" } }),
      ]);
      if (typeof requested?.value !== "string" || requested.value === handled?.value) return;
      if (!(await guardedGlpiSync())) return;
      await prisma.setting.upsert({
        where: { key: "glpi.handledRequestAt" },
        update: { value: requested.value },
        create: { key: "glpi.handledRequestAt", value: requested.value },
      });
    })().catch((error) => console.error(JSON.stringify({ level: "error", event: "glpi.request.failed", error: String(error) }))));
  }
  cron.schedule("* * * * *", () => void cleanupStaleSessions().catch((error) => {
    console.error(JSON.stringify({ level: "error", event: "sessions.cleanup.failed", error: String(error) }));
  }));
  cron.schedule("0 */6 * * *", () => {
    void discoverScreenCandidates(prisma)
      .then((count) => log("screens.probed", { count }))
      .catch((error) => console.error(JSON.stringify({ level: "error", event: "screens.failed", error: String(error) })));
  });

  const port = Number(process.env.WORKER_HEALTH_PORT ?? process.env.WORKER_PORT ?? 8082);
  const server = http.createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "worker", version: WORKER_VERSION }));
  }).listen(port, () => log("worker.started", { port }));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

if (process.env.NODE_ENV !== "test") startWorker();
