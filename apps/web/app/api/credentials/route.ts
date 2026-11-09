import { getPrisma } from "@puestomap/db";
import { credentialCreateSchema } from "@puestomap/shared";
import { errorResponse, jsonOk, parseBody, requireRole, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { encryptVncPassword } from "@/lib/vnc-credentials";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("TECH", "ADMIN");
    const items = await getPrisma().vncCredential.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { computers: true } },
      },
    });
    return jsonOk({ items });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    const input = await parseBody(req, credentialCreateSchema);
    const prisma = getPrisma();
    const existing = await prisma.vncCredential.findUnique({ where: { name: input.name } });
    if (existing) throw new ApiError(409, "DUPLICATE", `Ya existe la credencial ${input.name}`);

    const { passwordEnc, truncated } = encryptVncPassword(input.password);

    if (input.isDefault) {
      await prisma.vncCredential.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const credential = await prisma.vncCredential.create({
      data: {
        name: input.name,
        passwordEnc,
        isDefault: input.isDefault ?? false,
      },
      select: { id: true, name: true, isDefault: true },
    });
    await audit({
      userId: user.id,
      action: "credential.create",
      entity: "VncCredential",
      entityId: credential.id,
      data: { name: credential.name, isDefault: credential.isDefault, truncated },
      ip: clientIp(req),
    });
    return jsonOk({ ...credential, truncated }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
