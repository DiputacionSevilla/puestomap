import { getPrisma } from "@puestomap/db";
import { computerPositionSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { validatePlacement } from "@/lib/placement";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, computerPositionSchema);
    const prisma = getPrisma();

    const current = await prisma.computer.findUnique({ where: { id }, select: { id: true, hostname: true, glpiId: true } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");

    const placement = await validatePlacement(input);
    // RF-25: solo con el flag activo, equipo enlazado, confirmación del técnico y despacho con lugar GLPI.
    let glpiLocationTarget: number | undefined;
    if (process.env.GLPI_WRITEBACK_LOCATION === "true" && input.glpiWriteback === true && current.glpiId !== null && placement.officeId) {
      const office = await prisma.office.findUnique({ where: { id: placement.officeId }, select: { glpiLocationId: true } });
      if (office?.glpiLocationId) glpiLocationTarget = office.glpiLocationId;
    }
    await prisma.computer.update({
      where: { id },
      data: {
        ...(glpiLocationTarget !== undefined ? { glpiLocationTarget } : {}),
        floorId: placement.floorId,
        officeId: placement.officeId,
        departmentId: placement.departmentId ?? undefined,
        posX: placement.posX,
        posY: placement.posY,
      },
    });
    await audit({
      userId: user.id,
      action: "computer.move",
      entity: "Computer",
      entityId: id,
      data: {
        hostname: current.hostname,
        floorId: placement.floorId,
        posX: placement.posX,
        posY: placement.posY,
        officeId: placement.officeId,
        ...(glpiLocationTarget !== undefined ? { glpiLocationPending: glpiLocationTarget } : {}),
      },
      ip: clientIp(req),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const current = await prisma.computer.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");

    await prisma.computer.update({
      where: { id },
      data: { posX: null, posY: null },
    });
    await audit({
      userId: user.id,
      action: "computer.unplace",
      entity: "Computer",
      entityId: id,
      ip: clientIp(req),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
