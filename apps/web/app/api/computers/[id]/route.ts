import { getPrisma } from "@puestomap/db";
import type { Prisma } from "@puestomap/db";
import { computerPatchSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { validatePlacement } from "@/lib/placement";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole();
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const computer = await prisma.computer.findUnique({
      where: { id },
      include: {
        floor: { select: { id: true, name: true, building: { select: { id: true, name: true, code: true } } } },
        office: { select: { id: true, code: true, name: true, rect: true } },
        department: { select: { id: true, code: true, name: true } },
        credential: { select: { id: true, name: true, isDefault: true } },
        screens: { orderBy: { index: "asc" } },
      },
    });
    if (!computer) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");

    const [sessions, audits] = await Promise.all([
      prisma.remoteSession.findMany({
        where: { computerId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true, username: true } } },
      }),
      prisma.auditLog.findMany({
        where: { entity: "Computer", entityId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true, username: true } } },
      }),
    ]);

    return jsonOk({ computer, sessions, audits });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, computerPatchSchema);
    const prisma = getPrisma();

    const current = await prisma.computer.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");

    const floorChanged = input.floorId !== undefined && input.floorId !== current.floorId;
    let posX = input.posX !== undefined ? input.posX : current.posX;
    let posY = input.posY !== undefined ? input.posY : current.posY;
    if (floorChanged && input.posX === undefined) {
      posX = null;
      posY = null;
    }

    const placement = await validatePlacement({
      floorId: input.floorId !== undefined ? input.floorId : current.floorId,
      officeId: input.officeId !== undefined ? input.officeId : current.officeId,
      departmentId: input.departmentId !== undefined ? input.departmentId : current.departmentId,
      posX,
      posY,
    });

    if (input.credentialId) {
      const credential = await prisma.vncCredential.findUnique({
        where: { id: input.credentialId },
        select: { id: true },
      });
      if (!credential) throw new ApiError(422, "VALIDATION", "Credencial VNC no encontrada");
    }

    const data: Prisma.ComputerUncheckedUpdateInput = {
      floorId: placement.floorId,
      officeId: placement.officeId,
      departmentId: placement.departmentId,
      posX: placement.posX,
      posY: placement.posY,
    };
    if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
    if (input.phoneExt !== undefined) data.phoneExt = input.phoneExt;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.assetTag !== undefined) data.assetTag = input.assetTag;
    if (input.vncPort !== undefined) data.vncPort = input.vncPort;
    if (input.credentialId !== undefined) data.credentialId = input.credentialId;
    if (input.vncOverride !== undefined) data.vncOverride = input.vncOverride;
    if (input.externalRef !== undefined) data.externalRef = input.externalRef;

    const updated = await prisma.computer.update({
      where: { id },
      data,
    });

    const changed = Object.keys(input);
    if (changed.length > 0) {
      await audit({
        userId: user.id,
        action: "computer.update",
        entity: "Computer",
        entityId: id,
        data: { changed },
        ip: clientIp(req),
      });
    }

    return jsonOk({ id: updated.id, hostname: updated.hostname });
  } catch (err) {
    return errorResponse(err);
  }
}
