import { getPrisma } from "@puestomap/db";
import { ApiError, errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const current = await prisma.computer.findUnique({ where: { id }, select: { id: true, hostname: true } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");
    await prisma.computer.update({ where: { id }, data: { archived: false } });
    await audit({
      userId: user.id,
      action: "computer.restore",
      entity: "Computer",
      entityId: id,
      data: { hostname: current.hostname },
      ip: clientIp(req),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
