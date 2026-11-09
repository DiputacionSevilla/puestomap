import { discoverScreens } from "@puestomap/shared";
import { probeTcpPort } from "@puestomap/shared/probe";
import type { PrismaClient } from "@puestomap/db";

export async function discoverComputerScreens(
  prisma: PrismaClient,
  computerId: string,
  options: { max: number; timeoutMs: number },
) {
  const computer = await prisma.computer.findUnique({
    where: { id: computerId },
    include: { screens: true },
  });
  if (!computer) return [];
  const updates = await discoverScreens(
    computer.ip ?? computer.hostname,
    computer.screens,
    options,
    probeTcpPort,
  );
  for (const screen of updates) {
    await prisma.computerScreen.upsert({
      where: { computerId_index: { computerId, index: screen.index } },
      create: { ...screen, id: undefined, computerId },
      update: {
        reachable: screen.reachable,
        lastProbeAt: screen.lastProbeAt,
        lastOkAt: screen.lastOkAt,
        enabled: screen.enabled,
      },
    });
  }
  return updates;
}

export async function discoverScreenCandidates(prisma: PrismaClient) {
  const candidates = await prisma.computer.findMany({
    where: {
      archived: false,
      online: true,
      OR: [{ monitorCount: { gt: 1 } }, { screens: { some: {} } }],
    },
    select: { id: true },
  });
  const options = {
    max: Number(process.env.PROBE_SCREEN_MAX ?? 4),
    timeoutMs: Number(process.env.PROBE_TIMEOUT_MS ?? 1500),
  };
  for (const candidate of candidates) {
    await discoverComputerScreens(prisma, candidate.id, options);
  }
  return candidates.length;
}
