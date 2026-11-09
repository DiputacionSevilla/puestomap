import { getPrisma } from "@puestomap/db";
import { credentialPatchSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { encryptVncPassword } from "@/lib/vnc-credentials";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, credentialPatchSchema);
    const prisma = getPrisma();
    const current = await prisma.vncCredential.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Credencial no encontrada");

    let truncated = false;
    const data: { name?: string; isDefault?: boolean; passwordEnc?: string } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.password !== undefined) {
      const enc = encryptVncPassword(input.password);
      data.passwordEnc = enc.passwordEnc;
      truncated = enc.truncated;
    }
    if (input.isDefault !== undefined) {
      data.isDefault = input.isDefault;
      if (input.isDefault) {
        await prisma.vncCredential.updateMany({
          where: { isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
    }

    const credential = await prisma.vncCredential.update({
      where: { id },
      data,
      select: { id: true, name: true, isDefault: true },
    });
    await audit({
      userId: user.id,
      action: "credential.update",
      entity: "VncCredential",
      entityId: id,
      data: { changed: Object.keys(input), truncated },
      ip: clientIp(req),
    });
    return jsonOk({ ...credential, truncated });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const current = await prisma.vncCredential.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { computers: true } } },
    });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Credencial no encontrada");
    if (current._count.computers > 0) {
      throw new ApiError(
        409,
        "IN_USE",
        `No se puede borrar la credencial ${current.name}: la usan ${current._count.computers} equipo(s)`,
      );
    }
    await prisma.vncCredential.delete({ where: { id } });
    await audit({
      userId: user.id,
      action: "credential.delete",
      entity: "VncCredential",
      entityId: id,
      data: { name: current.name },
      ip: clientIp(req),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
