import { getPrisma } from "@puestomap/db";
import type { Prisma } from "@puestomap/db";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import {
  STALE_INVENTORY_DAYS,
  deriveMultiStateFrom,
  stateWhere,
} from "@/lib/computers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole();
    const prisma = getPrisma();

    const staleCutoff = new Date(Date.now() - STALE_INVENTORY_DAYS * 24 * 60 * 60 * 1000);
    const base: Prisma.ComputerWhereInput = { archived: false };

    const [
      total,
      ready,
      notListening,
      notInstalled,
      offlineOrUnknown,
      unplaced,
      staleInventory,
    ] = await Promise.all([
      prisma.computer.count({ where: base }),
      prisma.computer.count({ where: { ...base, ...stateWhere("READY") } }),
      prisma.computer.count({ where: { ...base, ...stateWhere("NOT_LISTENING") } }),
      prisma.computer.count({ where: { ...base, ...stateWhere("NOT_INSTALLED") } }),
      prisma.computer.count({
        where: {
          ...base,
          OR: [stateWhere("OFFLINE"), stateWhere("UNKNOWN")],
        },
      }),
      prisma.computer.count({
        where: { ...base, OR: [{ floorId: null }, { posX: null }, { posY: null }] },
      }),
      prisma.computer.count({
        where: {
          ...base,
          lastInventoryAt: { lt: staleCutoff },
        },
      }),
    ]);

    const rows = await prisma.computer.findMany({
      where: base,
      include: {
        floor: { select: { buildingId: true, building: { select: { name: true } } } },
        screens: { select: { index: true, port: true, label: true, enabled: true, source: true } },
      },
    });

    let multiPending = 0;
    const byBuilding = new Map<
      string,
      {
        name: string;
        total: number;
        ready: number;
        notListening: number;
        notInstalled: number;
        offlineOrUnknown: number;
        unplaced: number;
      }
    >();

    for (const row of rows) {
      const multi = deriveMultiStateFrom(row);
      if (multi === "MULTI_PENDING") multiPending += 1;

      const key = row.floor?.buildingId ?? "sin-edificio";
      const entry = byBuilding.get(key) ?? {
        name: row.floor?.building.name ?? "Sin edificio",
        total: 0,
        ready: 0,
        notListening: 0,
        notInstalled: 0,
        offlineOrUnknown: 0,
        unplaced: 0,
      };
      entry.total += 1;
      const state =
        row.online === true && row.vncReachable === true
          ? "READY"
          : row.online === true && row.vncReachable === false
            ? "NOT_LISTENING"
            : row.vncOverride === "NO" || (row.vncOverride === null && row.vncInstalled === "NO")
              ? "NOT_INSTALLED"
              : row.online === false
                ? "OFFLINE"
                : "UNKNOWN";
      if (state === "READY") entry.ready += 1;
      else if (state === "NOT_LISTENING") entry.notListening += 1;
      else if (state === "NOT_INSTALLED") entry.notInstalled += 1;
      else entry.offlineOrUnknown += 1;
      if (!row.floorId || row.posX == null || row.posY == null) entry.unplaced += 1;
      byBuilding.set(key, entry);
    }

    const [lastSessions, lastGlpiRun, lastSync, lastProbe] = await Promise.all([
      prisma.remoteSession.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          user: { select: { name: true, username: true } },
          computer: { select: { hostname: true, id: true } },
        },
      }),
      prisma.syncRun.findFirst({
        where: { type: "GLPI", status: { not: "RUNNING" } },
        orderBy: { finishedAt: "desc" },
      }),
      prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
      prisma.computer.aggregate({ _max: { lastProbeAt: true } }),
    ]);

    return jsonOk({
      kpis: {
        total,
        ready,
        notListening,
        notInstalled,
        offlineOrUnknown,
        unplaced,
        staleInventory,
        multiPending,
      },
      byBuilding: Array.from(byBuilding.values()),
      lastSessions,
      lastGlpiRun,
      lastSync,
      lastProbeAt: lastProbe._max.lastProbeAt,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
