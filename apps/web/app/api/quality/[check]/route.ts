import { getPrisma } from "@puestomap/db";
import { qualityCheckSchema, sanitizeCsvCell, type QualityCheck } from "@puestomap/shared";
import { errorResponse, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { computerListInclude } from "@/lib/computers";
import { qualityIds, qualityReason } from "@/lib/quality";

export async function GET(req: Request, ctx: { params: Promise<{ check: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const raw = (await ctx.params).check.replace(/\.csv$/, "");
    const check = qualityCheckSchema.parse(raw) as QualityCheck;
    const ids = await qualityIds(check);
    const rows = await getPrisma().computer.findMany({ where: { id: { in: ids } }, include: computerListInclude, orderBy: { hostname: "asc" } });
    const headers = ["hostname", "ip", "asignado_a", "extension", "edificio_codigo", "planta_nombre", "despacho_codigo", "departamento_codigo", "pos_x", "pos_y", "puerto_vnc", "credencial", "notas", "asset_tag", "usuario_dominio", "motivo"];
    const lines = rows.map((row) => [
      row.hostname, row.ip, row.assignedTo, row.phoneExt, row.floor?.building.code, row.floor?.name,
      row.office?.code, row.department?.code, row.posX, row.posY, row.vncPort, "", row.notes,
      row.assetTag, row.adUsername, qualityReason(check),
    ].map(sanitizeCsvCell).join(";"));
    await audit({ userId: user.id, action: "export.quality", entity: "Computer", data: { check, count: rows.length }, ip: clientIp(req) });
    return new Response(`\uFEFF${headers.join(";")}\r\n${lines.join("\r\n")}\r\n`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="calidad-${check}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
