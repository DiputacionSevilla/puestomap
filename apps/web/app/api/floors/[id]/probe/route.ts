import { getPrisma } from "@puestomap/db";
import { applyProbeResult, deriveVncState } from "@puestomap/shared";
import { probeComputer } from "@puestomap/shared/probe";
import pLimit from "p-limit";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const computers = await prisma.computer.findMany({
      where: { floorId: id, archived: false },
    });

    const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 1500);
    const onlinePorts = (process.env.PROBE_ONLINE_PORTS ?? "445,135,3389")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    const concurrency = Number(process.env.PROBE_CONCURRENCY ?? 32);
    const limit = pLimit(Number.isFinite(concurrency) ? concurrency : 32);

    await Promise.all(
      computers.map((computer) =>
        limit(async () => {
          const host = computer.ip ?? computer.hostname;
          const result = await probeComputer({ host, vncPort: computer.vncPort }, { timeoutMs, onlinePorts });
          const update = applyProbeResult(computer, result);
          await prisma.computer.update({ where: { id: computer.id }, data: update });
        }),
      ),
    );

    const rows = await prisma.computer.findMany({
      where: { floorId: id, archived: false },
      select: {
        id: true,
        hostname: true,
        online: true,
        vncReachable: true,
        vncInstalled: true,
        vncOverride: true,
      },
    });
    return jsonOk({
      items: rows.map((row) => ({
        id: row.id,
        hostname: row.hostname,
        state: deriveVncState({
          online: row.online,
          vncReachable: row.vncReachable,
          vncInstalled: row.vncInstalled,
          vncOverride: row.vncOverride,
        }),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
