import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { computerErrorsCsv, parseCsvTable, validateComputerImport } from "@puestomap/shared";
import { getPrisma } from "@puestomap/db";
import { ApiError, errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { applyComputerImport, loadComputerImportCtx } from "@/lib/import-apply";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    const body = (await req.json()) as {
      csv?: string;
      crearEquipos?: boolean;
      omitirErrores?: boolean;
      fileName?: string;
    };
    if (typeof body.csv !== "string" || body.csv.length === 0) {
      throw new ApiError(422, "VALIDATION", "Falta el CSV");
    }
    const crearEquipos = body.crearEquipos !== false;
    const omitirErrores = body.omitirErrores === true;

    const { rows } = parseCsvTable(body.csv);
    const { ctx } = await loadComputerImportCtx();
    const results = validateComputerImport(rows, ctx, { crearEquipos });

    const withErrors = results.filter((r) => r.errors.length > 0);
    if (withErrors.length > 0 && !omitirErrores) {
      throw new ApiError(
        422,
        "ROWS_WITH_ERRORS",
        `Hay ${withErrors.length} fila(s) con errores. Marca "omitir filas con error" para continuar.`,
      );
    }

    const prisma = getPrisma();
    const run = await prisma.syncRun.create({ data: { type: "CSV", status: "RUNNING" } });

    const summary = await applyComputerImport(results, { omitirErrores });
    const full = {
      ...summary,
      total: results.length,
      avisos: results.filter((r) => r.warnings.length > 0).length,
    };

    let erroresUrl: string | null = null;
    if (withErrors.length > 0) {
      const uploadsDir = process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads");
      const dir = path.join(uploadsDir, "imports");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${run.id}.csv`), computerErrorsCsv(results), "utf8");
      erroresUrl = `/api/import/runs/${run.id}/errors.csv`;
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: full.errors > 0 ? "PARTIAL" : "OK",
        finishedAt: new Date(),
        stats: full as never,
        error: null,
      },
    });
    await audit({
      userId: user.id,
      action: "import.computers",
      entity: "SyncRun",
      entityId: run.id,
      data: { ...full, fileName: body.fileName ?? null },
      ip: clientIp(req),
    });

    return jsonOk({ ...full, erroresUrl });
  } catch (err) {
    return errorResponse(err);
  }
}
