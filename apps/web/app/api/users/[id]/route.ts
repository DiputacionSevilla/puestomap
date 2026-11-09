import bcrypt from "bcryptjs";
import { getPrisma } from "@puestomap/db";
import { userPatchSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, userPatchSchema);
    const prisma = getPrisma();
    const current = await prisma.user.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "Usuario no encontrado");

    const data: {
      name?: string;
      email?: string | null;
      role?: "ADMIN" | "TECH" | "VIEWER";
      active?: boolean;
      passwordHash?: string;
    } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.role !== undefined) data.role = input.role;
    if (input.active !== undefined) data.active = input.active;
    if (input.password !== undefined) {
      data.passwordHash = bcrypt.hashSync(input.password, 12);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, name: true, email: true, role: true, active: true },
    });

    if (input.active === false || input.role !== undefined || input.password !== undefined) {
      await prisma.user.update({
        where: { id },
        data: { failedLogins: 0, lockedUntil: null },
      });
    }

    await audit({
      userId: admin.id,
      action: "user.update",
      entity: "User",
      entityId: id,
      data: {
        changed: Object.keys(input),
        passwordChanged: input.password !== undefined,
      },
      ip: clientIp(req),
    });
    return jsonOk(user);
  } catch (err) {
    return errorResponse(err);
  }
}
