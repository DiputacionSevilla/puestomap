import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { parseStructureCsv, validateStructureRows } from "@/lib/import-csv";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = (await req.json()) as { csv?: string };
    if (typeof body.csv !== "string" || body.csv.length === 0) {
      return jsonOk({ error: { code: "VALIDATION", message: "Falta el CSV" } }, 422);
    }
    const rows = parseStructureCsv(body.csv);
    const results = validateStructureRows(rows);
    return jsonOk({
      rows: results.map((r) => ({ line: r.line, data: r.data, errors: r.errors })),
      summary: {
        total: results.length,
        valid: results.filter((r) => r.errors.length === 0).length,
        invalid: results.filter((r) => r.errors.length > 0).length,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
