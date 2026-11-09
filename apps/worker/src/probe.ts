import { getPrisma, type PrismaClient } from "@puestomap/db";
import { applyProbeResult } from "@puestomap/shared";
import { probeComputer } from "@puestomap/shared/probe";
import pLimit from "p-limit";
import { discoverComputerScreens } from "./screens.js";

export async function runProbe(prisma: PrismaClient = getPrisma()): Promise<void> {
  const run = await prisma.syncRun.create({ data: { type: "PROBE" } });
  try {
    const computers = await prisma.computer.findMany({ where: { archived: false } });
    const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 1500);
    const onlinePorts = (process.env.PROBE_ONLINE_PORTS ?? "445,135,3389")
      .split(",").map(Number).filter((port) => Number.isInteger(port) && port > 0);
    const configuredConcurrency = Number(process.env.PROBE_CONCURRENCY ?? 32);
    const limit = pLimit(configuredConcurrency > 0 ? configuredConcurrency : 32);
    let errors = 0;

    await Promise.all(computers.map((computer) => limit(async () => {
      try {
        const result = await probeComputer(
          { host: computer.ip ?? computer.hostname, vncPort: computer.vncPort },
          { timeoutMs, onlinePorts },
        );
        await prisma.computer.update({ where: { id: computer.id }, data: applyProbeResult(computer, result) });
        if (result.online === true && ((computer.monitorCount ?? 0) > 1 || await prisma.computerScreen.count({ where: { computerId: computer.id } }) > 0)) {
          await discoverComputerScreens(prisma, computer.id, {
            max: Number(process.env.PROBE_SCREEN_MAX ?? 4),
            timeoutMs,
          });
        }
      } catch {
        errors += 1;
      }
    })));
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: errors > 0 ? "PARTIAL" : "OK",
        finishedAt: new Date(),
        stats: { total: computers.length, errors },
      },
    });
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "ERROR", finishedAt: new Date(), error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
