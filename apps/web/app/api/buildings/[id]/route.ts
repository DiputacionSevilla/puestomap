import { getPrisma } from "@puestomap/db";
import { buildingPatchSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, buildingPatchSchema);
    const prisma = getPrisma();
    const current = await prisma.building.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Edificio no encontrado");

    const building = await prisma.building.update({
      where: { id },
      data: {
        code: input.code,
        name: input.name,
        address: input.address,
        sortOrder: input.sortOrder,
      },
    });
    await audit({
      userId: user.id,
      action: "building.update",
      entity: "Building",
      entityId: id,
      data: { changed: Object.keys(input) },
      ip: clientIp(req),
    });
    return jsonOk(building);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const building = await prisma.building.findUnique({
      where: { id },
      include: { _count: { select: { floors: true } } },
    });
    if (!building) throw new ApiError(404, "NOT_FOUND", "Edificio no encontrado");
    if (building._count.floors > 0) {
      throw new ApiError(
        409,
        "IN_USE",
        `No se puede borrar el edificio ${building.name}: tiene ${building._count.floors} planta(s) asociadas`,
      );
    }
    await prisma.building.delete({ where: { id } });
    await audit({
      userId: user.id,
      action: "building.delete",
      entity: "Building",
      entityId: id,
      data: { code: building.code },
      ip: clientIp(req),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
