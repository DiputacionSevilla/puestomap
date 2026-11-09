import { getPrisma } from "@puestomap/db";
import { discoverScreens } from "@puestomap/shared";
import { probeTcpPort } from "@puestomap/shared/probe";
import { ApiError } from "./api";

export async function discoverComputerScreens(computerId: string) {
  const prisma = getPrisma();
  const computer = await prisma.computer.findUnique({
    where: { id: computerId },
    include: { screens: true },
  });
  if (!computer) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");
  const updates = await discoverScreens(
    computer.ip ?? computer.hostname,
    computer.screens,
    {
      max: Number(process.env.PROBE_SCREEN_MAX ?? 4),
      timeoutMs: Number(process.env.PROBE_TIMEOUT_MS ?? 1500),
    },
    probeTcpPort,
  );
  for (const screen of updates) {
    await prisma.computerScreen.upsert({
      where: { computerId_index: { computerId, index: screen.index } },
      create: {
        computerId,
        index: screen.index,
        port: screen.port,
        label: screen.label,
        source: screen.source,
        enabled: screen.enabled,
        reachable: screen.reachable,
        lastProbeAt: screen.lastProbeAt,
        lastOkAt: screen.lastOkAt,
      },
      update: {
        reachable: screen.reachable,
        lastProbeAt: screen.lastProbeAt,
        lastOkAt: screen.lastOkAt,
        enabled: screen.enabled,
      },
    });
  }
  return prisma.computerScreen.findMany({
    where: { computerId },
    orderBy: { index: "asc" },
  });
}
