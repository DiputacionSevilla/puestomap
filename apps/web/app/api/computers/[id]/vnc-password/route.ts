import { getPrisma } from "@puestomap/db";
import { decryptSecret } from "@puestomap/shared/crypto";
import { ApiError, errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { envValue } from "@/lib/env-file";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();

    const computer = await prisma.computer.findUnique({
      where: { id },
      include: { credential: { select: { passwordEnc: true, name: true } } },
    });
    if (!computer) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");

    let passwordEnc = computer.credential?.passwordEnc ?? null;
    if (!passwordEnc) {
      const fallback = await prisma.vncCredential.findFirst({
        where: { isDefault: true },
        select: { passwordEnc: true },
      });
      passwordEnc = fallback?.passwordEnc ?? null;
    }
    if (!passwordEnc) {
      throw new ApiError(404, "NOT_FOUND", "El equipo no tiene credencial VNC asignada");
    }

    const key = envValue("VNC_ENC_KEY");
    if (!key) throw new ApiError(500, "CONFIG", "Falta VNC_ENC_KEY en la configuración del servidor");

    await audit({
      userId: user.id,
      action: "credential.copy",
      entity: "Computer",
      entityId: id,
      data: { hostname: computer.hostname, credential: computer.credential?.name ?? "por defecto" },
      ip: clientIp(req),
    });

    return jsonOk({ password: decryptSecret(passwordEnc, key) });
  } catch (err) {
    return errorResponse(err);
  }
}
