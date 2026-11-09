import { getPrisma, type PrismaClient } from "@puestomap/db";
import pLimit from "p-limit";
import { createOcsClient, type OcsClient } from "../ocs/client.js";
import { mapOcsComputer } from "../ocs/mapper.js";
import { mergeOcsComputer, ocsDataChanged } from "./merge.js";

type SyncStats = { created: number; updated: number; unchanged: number; errors: number };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runOcsSync(options: {
  prisma?: PrismaClient;
  client?: OcsClient;
  now?: Date;
} = {}): Promise<SyncStats> {
  const prisma = options.prisma ?? getPrisma();
  const now = options.now ?? new Date();
  const run = await prisma.syncRun.create({ data: { type: "OCS" } });
  const stats: SyncStats = { created: 0, updated: 0, unchanged: 0, errors: 0 };

  try {
    const lastSetting = await prisma.setting.findUnique({ where: { key: "ocs.lastSyncAt" } });
    const lastIso = typeof lastSetting?.value === "string" ? lastSetting.value : null;
    const lastDate = lastIso ? new Date(lastIso) : null;
    const secondsSince = lastDate && !Number.isNaN(lastDate.getTime())
      ? Math.ceil((now.getTime() - lastDate.getTime()) / 1000) + 3600
      : undefined;
    const client = options.client ?? createOcsClient({
      baseUrl: process.env.OCS_API_URL ?? "",
      username: process.env.OCS_API_USER,
      password: process.env.OCS_API_PASSWORD,
    });
    if (!process.env.OCS_API_URL && !options.client) throw new Error("OCS_API_URL no está configurada");
    const ids = await client.listComputerIds(secondsSince);
    const limit = pLimit(4);

    await Promise.all(ids.map((id) => limit(async () => {
      try {
        const mapped = mapOcsComputer(await client.getComputer(id));
        const byOcsId = await prisma.computer.findUnique({ where: { ocsId: mapped.ocsId } });
        const current = byOcsId ?? await prisma.computer.findUnique({ where: { hostname: mapped.hostname } });
        const data = mergeOcsComputer(current, mapped, now);
        if (!current) {
          await prisma.computer.create({ data: { ...data, source: "OCS" } });
          stats.created += 1;
        } else if (ocsDataChanged(current as unknown as Record<string, unknown>, data)) {
          await prisma.computer.update({ where: { id: current.id }, data: { ...data, source: "OCS" } });
          stats.updated += 1;
        } else {
          stats.unchanged += 1;
        }
      } catch (error) {
        stats.errors += 1;
        console.error(JSON.stringify({ level: "error", event: "ocs.computer.failed", ocsId: id, error: errorMessage(error) }));
      }
    })));

    const status = stats.errors > 0 ? "PARTIAL" : "OK";
    await prisma.$transaction([
      prisma.syncRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), stats } }),
      ...(status === "OK" ? [prisma.setting.upsert({
        where: { key: "ocs.lastSyncAt" },
        update: { value: now.toISOString() },
        create: { key: "ocs.lastSyncAt", value: now.toISOString() },
      })] : []),
    ]);
    return stats;
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "ERROR", finishedAt: new Date(), stats, error: errorMessage(error) },
    });
    throw error;
  }
}
