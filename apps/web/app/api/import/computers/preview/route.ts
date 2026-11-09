import { validateComputerCsvRows } from "@puestomap/shared";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { loadKnownStructure, parseComputerCsv, summarize } from "@/lib/import-csv";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = (await req.json()) as { csv?: string; createMissing?: boolean };
    if (typeof body.csv !== "string" || body.csv.length === 0) {
      return jsonOk({ error: { code: "VALIDATION", message: "Falta el CSV" } }, 422);
    }
    const rows = parseComputerCsv(body.csv);
    const known = await loadKnownStructure();
    const results = validateComputerCsvRows(rows, known, {
      createMissing: body.createMissing === true,
    });
    return jsonOk({
      rows: results.map((r) => ({ line: r.line, data: r.values, errors: r.errors })),
      summary: summarize(results),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
