import { getPrisma } from "@puestomap/db";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("TECH", "ADMIN");
    const url = new URL(req.url);
    const sp = url.searchParams;
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 50) || 50));

    const where: Record<string, unknown> = {};
    if (sp.get("status")) where.status = sp.get("status");
    if (sp.get("userId")) where.userId = sp.get("userId");
    if (sp.get("computerId")) where.computerId = sp.get("computerId");
    if (sp.get("from") || sp.get("to")) {
      const createdAt: Record<string, Date> = {};
      if (sp.get("from")) createdAt.gte = new Date(sp.get("from") as string);
      if (sp.get("to")) createdAt.lte = new Date(sp.get("to") as string);
      where.createdAt = createdAt;
    }

    const prisma = getPrisma();
    const [total, items] = await Promise.all([
      prisma.remoteSession.count({ where: where as never }),
      prisma.remoteSession.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { name: true, username: true } },
          computer: { select: { id: true, hostname: true } },
        },
      }),
    ]);
    return jsonOk({ items, total, page, pageSize });
  } catch (err) {
    return errorResponse(err);
  }
}
