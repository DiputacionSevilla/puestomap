import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { normalizeAdUser } from "@puestomap/shared";

export function lastUserIgnoreList(): string[] {
  return (process.env.LASTUSER_IGNORE ?? "system")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function backfillLastUserNorm(prisma: PrismaClient): Promise<number> {
  const ignore = lastUserIgnoreList();
  const computers = await prisma.computer.findMany({
    where: { lastUserNorm: null, lastUser: { not: null } },
    select: { id: true, lastUser: true },
  });
  let updated = 0;
  for (const computer of computers) {
    const norm = normalizeAdUser(computer.lastUser, ignore);
    await prisma.computer.update({
      where: { id: computer.id },
      data: { lastUserNorm: norm },
    });
    updated += 1;
  }
  return updated;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const prisma = new PrismaClient();
  backfillLastUserNorm(prisma)
    .then((count) => console.log(`[backfill] lastUserNorm actualizado en ${count} equipos`))
    .catch((err) => {
      console.error("[backfill] error:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
