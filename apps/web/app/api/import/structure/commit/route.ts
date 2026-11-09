import { requireLegacyImport } from "@/lib/legacy";
import { parseCsvTable, validateStructureImport } from "@puestomap/shared";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { applyStructureImport, loadStructureCtx } from "@/lib/import-apply";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    requireLegacyImport();
    const body = (await req.json()) as { csv?: string };
    if (typeof body.csv !== "string" || body.csv.length === 0) {
      return jsonOk({ error: { code: "VALIDATION", message: "Falta el CSV" } }, 422);
    }
    const { rows } = parseCsvTable(body.csv);
    const ctx = await loadStructureCtx();
    const results = validateStructureImport(rows, ctx);
    const summary = await applyStructureImport(results);
    await audit({
      userId: user.id,
      action: "import.structure",
      data: { ...summary, total: results.length, fileName: (body as { fileName?: string }).fileName ?? null },
      ip: clientIp(req),
    });
    return jsonOk({ ...summary, total: results.length });
  } catch (err) {
    return errorResponse(err);
  }
}
