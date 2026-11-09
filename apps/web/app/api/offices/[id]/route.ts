import { getPrisma, Prisma } from "@puestomap/db";
import { officePatchSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, officePatchSchema);
    const prisma = getPrisma();
    const current = await prisma.office.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Despacho no encontrado");

    const data: Prisma.OfficeUncheckedUpdateInput = {};
    if (input.code !== undefined) data.code = input.code;
    if (input.name !== undefined) data.name = input.name;
    if (input.departmentId !== undefined) data.departmentId = input.departmentId;
    if (input.rect !== undefined) {
      data.rect = (input.rect ?? Prisma.DbNull) as Prisma.InputJsonValue;
    }

    const office = await prisma.office.update({ where: { id }, data });
    await audit({
      userId: user.id,
      action: "office.update",
      entity: "Office",
      entityId: id,
      data: { changed: Object.keys(input) },
      ip: clientIp(req),
    });
    return jsonOk(office);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const office = await prisma.office.findUnique({
      where: { id },
      include: { _count: { select: { computers: true } } },
    });
    if (!office) throw new ApiError(404, "NOT_FOUND", "Despacho no encontrado");
    if (office._count.computers > 0) {
      throw new ApiError(
        409,
        "IN_USE",
        `No se puede borrar el despacho ${office.name}: tiene ${office._count.computers} equipo(s) asociados`,
      );
    }
    await prisma.office.delete({ where: { id } });
    await audit({
      userId: user.id,
      action: "office.delete",
      entity: "Office",
      entityId: id,
      ip: clientIp(req),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
