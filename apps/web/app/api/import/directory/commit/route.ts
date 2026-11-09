import { requireLegacyImport } from "@/lib/legacy";
import { getPrisma } from "@puestomap/db";
import { z } from "zod";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { directorySummary, previewDirectory } from "@/lib/directory-import";

const directoryCommitSchema = z.object({
  csv: z.string().min(1).max(10 * 1024 * 1024),
  marcarAusentesInactivos: z.boolean().optional().default(false),
  fileName: z.string().trim().max(255).optional(),
}).strict();

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    requireLegacyImport();
    const body = await parseBody(req, directoryCommitSchema);
    const rows = await previewDirectory(body.csv);
    const summary = directorySummary(rows);
    if (summary.errores > 0) throw new ApiError(422, "ROWS_WITH_ERRORS", `Hay ${summary.errores} fila(s) inválidas`);
    const valid = rows.flatMap((row) => row.values ? [row.values] : []);
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      for (const entry of valid) {
        await tx.directoryUser.upsert({
          where: { username: entry.username },
          create: { ...entry, active: true },
          update: { ...entry, active: true, importedAt: new Date() },
        });
      }
      if (body.marcarAusentesInactivos) {
        await tx.directoryUser.updateMany({
          where: { username: { notIn: valid.map((entry) => entry.username) } },
          data: { active: false },
        });
      }
    });
    await audit({
      userId: user.id,
      action: "import.directory",
      entity: "DirectoryUser",
      data: { ...summary, fileName: body.fileName ?? null, marcarAusentesInactivos: body.marcarAusentesInactivos === true },
      ip: clientIp(req),
    });
    return jsonOk({ created: summary.crear, updated: summary.actualizar, unchanged: summary.sinCambios, errors: 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
