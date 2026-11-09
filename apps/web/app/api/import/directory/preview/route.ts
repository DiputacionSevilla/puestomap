import { ApiError, errorResponse, jsonOk, requireRole } from "@/lib/api";
import { directorySummary, previewDirectory } from "@/lib/directory-import";

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const body = (await req.json()) as { csv?: string };
    if (!body.csv) throw new ApiError(422, "VALIDATION", "Falta el CSV");
    const rows = await previewDirectory(body.csv);
    return jsonOk({
      rows: rows.map((row) => ({ line: row.line, action: row.action, data: row.values, errors: row.errors, warnings: [] })),
      summary: directorySummary(rows),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
