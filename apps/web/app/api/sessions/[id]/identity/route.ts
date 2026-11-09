import { z } from "zod";
import { getPrisma } from "@puestomap/db";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const identitySchema = z.object({
  desktopName: z.string().trim().min(1).max(200),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, identitySchema);
    const prisma = getPrisma();

    const session = await prisma.remoteSession.findUnique({
      where: { id },
      include: { computer: { select: { hostname: true } } },
    });
    if (!session) throw new ApiError(404, "NOT_FOUND", "Sesión no encontrada");

    const identityOk = input.desktopName
      .toLowerCase()
      .includes(session.computer.hostname.toLowerCase());

    await prisma.remoteSession.update({
      where: { id },
      data: { desktopName: input.desktopName, identityOk },
    });

    if (!identityOk) {
      await audit({
        userId: user.id,
        action: "session.identity_mismatch",
        entity: "RemoteSession",
        entityId: id,
        data: {
          hostname: session.computer.hostname,
          desktopName: input.desktopName,
        },
        ip: clientIp(req),
      });
    }

    return jsonOk({ identityOk });
  } catch (err) {
    return errorResponse(err);
  }
}
