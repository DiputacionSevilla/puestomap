import bcrypt from "bcryptjs";
import { getPrisma } from "@puestomap/db";
import { changePasswordSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole();
    const input = await parseBody(req, changePasswordSchema);
    const prisma = getPrisma();

    const current = await prisma.user.findUnique({ where: { id: user.id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Usuario no encontrado");

    const ok = await bcrypt.compare(input.currentPassword, current.passwordHash);
    if (!ok) throw new ApiError(403, "FORBIDDEN", "La contraseña actual no es correcta");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: bcrypt.hashSync(input.newPassword, 12),
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await audit({
      userId: user.id,
      action: "user.password_change",
      entity: "User",
      entityId: user.id,
      ip: clientIp(req),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
