import type { PrismaClient } from "@puestomap/db";
import type { GlpiApi, GlpiClient } from "./client.js";

/** RF-25 CA-3: lo ÚNICO que PuestoMap escribe en GLPI es el lugar de un equipo. */
export function buildLocationUpdate(glpiId: number, locationId: number) {
  return { path: `Computer/${glpiId}`, body: { input: { locations_id: locationId } } };
}

export type WritebackStats = { sent: number; failed: number };

/** Envía los lugares pendientes. Un fallo deja el pendiente para el siguiente ciclo (CA-2). */
export async function flushLocationWrites(prisma: PrismaClient, client: GlpiClient): Promise<WritebackStats> {
  const pending = await prisma.computer.findMany({
    where: { glpiLocationTarget: { not: null }, glpiId: { not: null } },
    select: { id: true, hostname: true, glpiId: true, glpiLocationTarget: true },
  });
  const stats: WritebackStats = { sent: 0, failed: 0 };
  if (pending.length === 0) return stats;
  await client.withSession(async (api: GlpiApi) => {
    for (const computer of pending) {
      if (computer.glpiId === null || computer.glpiLocationTarget === null) continue;
      const update = buildLocationUpdate(computer.glpiId, computer.glpiLocationTarget);
      try {
        await api.put(update.path, update.body);
        await prisma.computer.update({ where: { id: computer.id }, data: { glpiLocationTarget: null } });
        await prisma.auditLog.create({
          data: {
            action: "computer.glpi_location",
            entity: "Computer",
            entityId: computer.id,
            data: { hostname: computer.hostname, locationId: computer.glpiLocationTarget },
          },
        });
        stats.sent += 1;
      } catch (error) {
        stats.failed += 1;
        console.error(JSON.stringify({ level: "error", event: "glpi.writeback.failed", hostname: computer.hostname, error: error instanceof Error ? error.message : String(error) }));
      }
    }
  });
  return stats;
}
