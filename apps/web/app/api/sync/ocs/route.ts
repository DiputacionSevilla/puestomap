import { getPrisma } from "@puestomap/db";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const prisma = getPrisma();
    // La web apunta la petición en Setting; el worker la recoge en <= 30 s (04 §Comunicación).
    await prisma.setting.upsert({
      where: { key: "ocs.requestedAt" },
      update: { value: new Date().toISOString() },
      create: { key: "ocs.requestedAt", value: new Date().toISOString() },
    });
    await audit({
      userId: user.id,
      action: "sync.requested",
      entity: "Setting",
      entityId: "ocs.requestedAt",
      ip: clientIp(req),
    });
    return jsonOk({ ok: true, queued: true });
  } catch (err) {
    return errorResponse(err);
  }
}
