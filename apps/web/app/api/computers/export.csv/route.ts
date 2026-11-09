import { getPrisma } from "@puestomap/db";
import { computersListQuerySchema, computersToCsv, type ComputerCsvRow } from "@puestomap/shared";
import { errorResponse, requireRole } from "@/lib/api";
import { buildComputersWhere, buildOrderBy, computerListInclude } from "@/lib/computers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole();
    const url = new URL(req.url);
    const query = computersListQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    );
    const prisma = getPrisma();
    const rows = await prisma.computer.findMany({
      where: buildComputersWhere(query),
      include: computerListInclude,
      orderBy: buildOrderBy(query),
    });

    const csvRows: ComputerCsvRow[] = rows.map((row) => ({
      hostname: row.hostname,
      ip: row.ip ?? "",
      asignado_a: row.assignedTo ?? "",
      extension: row.phoneExt ?? "",
      edificio_codigo: row.floor?.building.code ?? "",
      planta_nombre: row.floor?.name ?? "",
      despacho_codigo: row.office?.code ?? "",
      departamento_codigo: row.department?.code ?? "",
      pos_x: row.posX != null ? String(row.posX) : "",
      pos_y: row.posY != null ? String(row.posY) : "",
      puerto_vnc: String(row.vncPort),
      credencial: "",
      notas: row.notes ?? "",
      asset_tag: row.assetTag ?? "",
    }));

    return new Response(computersToCsv(csvRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="puestomap-equipos.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
