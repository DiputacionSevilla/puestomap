import { getPrisma } from "@puestomap/db";
import { departmentPatchSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, departmentPatchSchema);
    const prisma = getPrisma();
    const current = await prisma.department.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Departamento no encontrado");

    const department = await prisma.department.update({
      where: { id },
      data: { code: input.code, name: input.name },
    });
    await audit({
      userId: user.id,
      action: "department.update",
      entity: "Department",
      entityId: id,
      ip: clientIp(req),
    });
    return jsonOk(department);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const department = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { computers: true, offices: true } } },
    });
    if (!department) throw new ApiError(404, "NOT_FOUND", "Departamento no encontrado");
    if (department._count.computers > 0 || department._count.offices > 0) {
      throw new ApiError(
        409,
        "IN_USE",
        `No se puede borrar el departamento ${department.name}: tiene ${department._count.computers} equipo(s) y ${department._count.offices} despacho(s) asociados`,
      );
    }
    await prisma.department.delete({ where: { id } });
    await audit({
      userId: user.id,
      action: "department.delete",
      entity: "Department",
      entityId: id,
      ip: clientIp(req),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
