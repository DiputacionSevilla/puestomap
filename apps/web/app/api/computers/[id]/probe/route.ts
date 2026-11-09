import { getPrisma } from "@puestomap/db";
import { applyProbeResult, deriveVncState } from "@puestomap/shared";
import { probeComputer } from "@puestomap/shared/probe";
import { ApiError, errorResponse, jsonOk, requireRole } from "@/lib/api";
import { discoverComputerScreens } from "@/lib/screens";

export const dynamic = "force-dynamic";

export function probeOptionsFromEnv() {
  return {
    timeoutMs: Number(process.env.PROBE_TIMEOUT_MS ?? 1500),
    onlinePorts: (process.env.PROBE_ONLINE_PORTS ?? "445,135,3389")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
  };
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const computer = await prisma.computer.findUnique({
      where: { id },
      include: { screens: true },
    });
    if (!computer) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");

    const host = computer.ip ?? computer.hostname;
    const result = await probeComputer(
      { host, vncPort: computer.vncPort },
      probeOptionsFromEnv(),
    );
    const update = applyProbeResult(computer, result);
    if (result.online === true && ((computer.monitorCount ?? 0) > 1 || computer.screens.length > 0)) {
      await discoverComputerScreens(id);
    }
    const updated = await prisma.computer.update({
      where: { id },
      data: update,
      include: {
        floor: { select: { id: true, name: true, building: { select: { id: true, name: true, code: true } } } },
        office: { select: { id: true, code: true, name: true, rect: true } },
        department: { select: { id: true, code: true, name: true } },
        credential: { select: { id: true, name: true, isDefault: true } },
        screens: { orderBy: { index: "asc" } },
      },
    });

    return jsonOk({
      computer: updated,
      state: deriveVncState({
        online: updated.online,
        vncReachable: updated.vncReachable,
        vncInstalled: updated.vncInstalled,
        vncOverride: updated.vncOverride,
      }),
      probe: result,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
