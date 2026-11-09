import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ApiError, errorResponse, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await ctx.params;
    if (!/^[\w-]+$/.test(id)) throw new ApiError(400, "BAD_REQUEST", "id inválido");
    const uploadsDir = process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads");
    const filePath = path.join(uploadsDir, "imports", `${id}.csv`);
    if (!existsSync(filePath)) throw new ApiError(404, "NOT_FOUND", "Sin errores registrados para esa importación");
    const content = readFileSync(filePath, "utf8");
    return new Response(content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="errores-${id}.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
