import bcrypt from "bcryptjs";
import { getPrisma } from "@puestomap/db";
import { userCreateSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const items = await getPrisma().user.findMany({
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        lockedUntil: true,
        createdAt: true,
      },
    });
    return jsonOk({ items });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const input = await parseBody(req, userCreateSchema);
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({ where: { username: input.username } });
    if (existing) throw new ApiError(409, "DUPLICATE", `Ya existe el usuario ${input.username}`);

    const user = await prisma.user.create({
      data: {
        username: input.username,
        name: input.name,
        email: input.email ?? null,
        passwordHash: bcrypt.hashSync(input.password, 12),
        role: input.role ?? "TECH",
      },
      select: { id: true, username: true, name: true, role: true },
    });
    await audit({
      userId: admin.id,
      action: "user.create",
      entity: "User",
      entityId: user.id,
      data: { username: user.username, role: user.role },
      ip: clientIp(req),
    });
    return jsonOk(user, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
