import { getPrisma } from "@puestomap/db";
import { deriveVncState } from "@puestomap/shared";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole();
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const rows = await prisma.computer.findMany({
      where: { floorId: id, archived: false },
      orderBy: { hostname: "asc" },
      select: {
        id: true,
        hostname: true,
        ip: true,
        lastUser: true,
        assignedTo: true,
        posX: true,
        posY: true,
        online: true,
        vncReachable: true,
        vncInstalled: true,
        vncOverride: true,
        monitorCount: true,
        officeId: true,
      },
    });
    const items = rows.map((row) => ({
      ...row,
      state: deriveVncState({
        online: row.online,
        vncReachable: row.vncReachable,
        vncInstalled: row.vncInstalled,
        vncOverride: row.vncOverride,
      }),
    }));
    return jsonOk({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
