import { getPrisma } from "@puestomap/db";
import { ApiError, errorResponse, jsonOk, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const session = await prisma.remoteSession.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!session) throw new ApiError(404, "NOT_FOUND", "Sesión no encontrada");
    if (session.userId !== user.id && user.role !== "ADMIN") {
      throw new ApiError(403, "FORBIDDEN", "La sesión pertenece a otro usuario");
    }
    if (session.status === "PENDING" || session.status === "ACTIVE") {
      await prisma.remoteSession.update({
        where: { id },
        data: { status: "ENDED", endedAt: new Date(), endReason: "client_closed" },
      });
    }
    return jsonOk({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
