import { getPrisma } from "@puestomap/db";
import { QUALITY_CHECKS, QUALITY_LABELS, qualityChecksFor, type QualityCheck } from "@puestomap/shared";

export async function loadQualitySnapshot(now = new Date()) {
  const prisma = getPrisma();
  const [computers, directory, buildings] = await Promise.all([
    prisma.computer.findMany({
      where: { archived: false },
      select: {
        id: true, floorId: true, officeId: true, posX: true, posY: true, adUsername: true,
        lastUserNorm: true, ip: true, glpiId: true, lastInventoryAt: true,
        floor: { select: { buildingId: true } },
      },
    }),
    prisma.directoryUser.findMany({ select: { username: true } }),
    prisma.building.findMany({ select: { id: true, name: true } }),
  ]);
  const usernames = new Set(directory.map((user) => user.username));
  const checksById = new Map(computers.map((computer) => [computer.id, qualityChecksFor(computer, computers, usernames, now)]));
  const checks = Object.fromEntries(QUALITY_CHECKS.map((check) => [check, computers.filter((computer) => checksById.get(computer.id)?.includes(check)).length])) as Record<QualityCheck, number>;
  const byBuilding = buildings.map((building) => {
    const rows = computers.filter((computer) => computer.floor?.buildingId === building.id);
    const placed = rows.filter((computer) => computer.floorId && computer.posX !== null && computer.posY !== null).length;
    const withUser = rows.filter((computer) => computer.adUsername).length;
    return {
      buildingId: building.id,
      name: building.name,
      total: rows.length,
      placedPct: rows.length ? Math.round(placed * 100 / rows.length) : 0,
      withUserPct: rows.length ? Math.round(withUser * 100 / rows.length) : 0,
    };
  });
  return { computers, checksById, checks, byBuilding };
}

export async function qualityIds(check: QualityCheck): Promise<string[]> {
  const snapshot = await loadQualitySnapshot();
  return snapshot.computers.filter((computer) => snapshot.checksById.get(computer.id)?.includes(check)).map((computer) => computer.id);
}

export function qualityReason(check: QualityCheck): string {
  return QUALITY_LABELS[check];
}
