import { getPrisma, type PrismaClient } from "@puestomap/db";

export async function cleanupStaleSessions(
  prisma: PrismaClient = getPrisma(),
  now: Date = new Date(),
): Promise<{ expired: number; ended: number }> {
  const pendingBefore = new Date(now.getTime() - 2 * 60 * 1000);
  const activeBefore = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const [expired, ended] = await prisma.$transaction([
    prisma.remoteSession.updateMany({
      where: { status: "PENDING", createdAt: { lt: pendingBefore } },
      data: { status: "EXPIRED", endedAt: now, endReason: "expired" },
    }),
    prisma.remoteSession.updateMany({
      where: { status: "ACTIVE", startedAt: { lt: activeBefore } },
      data: { status: "ENDED", endedAt: now, endReason: "stale" },
    }),
  ]);
  return { expired: expired.count, ended: ended.count };
}
