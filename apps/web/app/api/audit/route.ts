import { getPrisma } from "@puestomap/db";
import type { Prisma } from "@puestomap/db";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("ADMIN");
    const url = new URL(req.url);
    const sp = url.searchParams;
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 50) || 50));

    const where: Prisma.AuditLogWhereInput = {};
    if (sp.get("userId")) where.userId = sp.get("userId") as string;
    if (sp.get("action")) where.action = { contains: sp.get("action") as string, mode: "insensitive" };
    if (sp.get("entity")) where.entity = sp.get("entity") as string;
    if (sp.get("entityId")) where.entityId = sp.get("entityId") as string;
    if (sp.get("from") || sp.get("to")) {
      where.createdAt = {};
      if (sp.get("from")) where.createdAt.gte = new Date(sp.get("from") as string);
      if (sp.get("to")) where.createdAt.lte = new Date(sp.get("to") as string);
    }

    const prisma = getPrisma();

    if (sp.get("format") === "csv") {
      const rows = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5000,
        include: { user: { select: { username: true } } },
      });
      const lines = ["fecha;usuario;accion;entidad;id_entidad;ip;datos"];
      for (const row of rows) {
        lines.push(
          [
            row.createdAt.toISOString(),
            row.user?.username ?? "",
            row.action,
            row.entity ?? "",
            row.entityId ?? "",
            row.ip ?? "",
            row.data ? JSON.stringify(row.data) : "",
          ]
            .map((cell) => (/[;"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
            .join(";"),
        );
      }
      return new Response("\uFEFF" + lines.join("\r\n") + "\r\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="puestomap-auditoria.csv"',
        },
      });
    }

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { username: true, name: true } } },
      }),
    ]);
    return jsonOk({ items, total, page, pageSize });
  } catch (err) {
    return errorResponse(err);
  }
}
