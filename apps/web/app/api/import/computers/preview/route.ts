import { requireLegacyImport } from "@/lib/legacy";
import { parseCsvTable, validateComputerImport } from "@puestomap/shared";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { loadComputerImportCtx } from "@/lib/import-apply";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    requireLegacyImport();
    const body = (await req.json()) as { csv?: string; crearEquipos?: boolean };
    if (typeof body.csv !== "string" || body.csv.length === 0) {
      return jsonOk({ error: { code: "VALIDATION", message: "Falta el CSV" } }, 422);
    }
    const { rows } = parseCsvTable(body.csv);
    const { ctx } = await loadComputerImportCtx();
    const results = validateComputerImport(rows, ctx, {
      crearEquipos: body.crearEquipos !== false,
    });
    return jsonOk({
      rows: results.map((r) => ({
        line: r.line,
        action: r.action,
        data: r.values,
        warnings: r.warnings,
        errors: r.errors,
      })),
      summary: {
        total: results.length,
        crear: results.filter((r) => r.action === "crear").length,
        actualizar: results.filter((r) => r.action === "actualizar").length,
        sinCambios: results.filter((r) => r.action === "sin cambios").length,
        errores: results.filter((r) => r.errors.length > 0).length,
        avisos: results.filter((r) => r.warnings.length > 0).length,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
