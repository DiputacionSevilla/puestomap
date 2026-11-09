import { getPrisma } from "@puestomap/db";
import { floorPatchSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, floorPatchSchema);
    const prisma = getPrisma();
    const current = await prisma.floor.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Planta no encontrada");

    const floor = await prisma.floor.update({
      where: { id },
      data: {
        name: input.name,
        level: input.level,
        planWidth: input.planWidth,
        planHeight: input.planHeight,
      },
    });
    await audit({
      userId: user.id,
      action: "floor.update",
      entity: "Floor",
      entityId: id,
      data: { changed: Object.keys(input) },
      ip: clientIp(req),
    });
    return jsonOk(floor);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const floor = await prisma.floor.findUnique({
      where: { id },
      include: { _count: { select: { computers: true, offices: true } } },
    });
    if (!floor) throw new ApiError(404, "NOT_FOUND", "Planta no encontrada");
    if (floor._count.computers > 0 || floor._count.offices > 0) {
      throw new ApiError(
        409,
        "IN_USE",
        `No se puede borrar la planta ${floor.name}: tiene ${floor._count.computers} equipo(s) y ${floor._count.offices} despacho(s) asociados`,
      );
    }
    await prisma.floor.delete({ where: { id } });
    await audit({
      userId: user.id,
      action: "floor.delete",
      entity: "Floor",
      entityId: id,
      ip: clientIp(req),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
