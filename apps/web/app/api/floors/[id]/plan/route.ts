import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";
import { aspectChanged, validateSvg } from "@puestomap/shared";
import { getPrisma } from "@puestomap/db";
import { ApiError, errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_PLAN_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function svgMaxBytes(): number {
  const mb = Number(process.env.SVG_MAX_MB ?? 2);
  return (Number.isFinite(mb) && mb > 0 ? mb : 2) * 1024 * 1024;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole();
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const floor = await prisma.floor.findUnique({ where: { id }, select: { planFile: true } });
    if (!floor?.planFile) throw new ApiError(404, "NOT_FOUND", "La planta no tiene plano");

    const uploadsDir = process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads");
    const filePath = path.join(uploadsDir, floor.planFile);
    if (!existsSync(filePath)) throw new ApiError(404, "NOT_FOUND", "Fichero de plano no encontrado");

    const ext = floor.planFile.split(".").pop() ?? "";
    const buffer = readFileSync(filePath);
    const headers: Record<string, string> = {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };
    if (ext === "svg") {
      headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }
    return new Response(new Uint8Array(buffer), { headers });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const floor = await prisma.floor.findUnique({
      where: { id },
      select: { id: true, planWidth: true, planHeight: true, planFile: true },
    });
    if (!floor) throw new ApiError(404, "NOT_FOUND", "Planta no encontrada");

    const form = await req.formData();
    const file = form.get("file");
    const confirmAspect = form.get("confirmAspect") === "true";
    const fromInitialLoad = form.get("source") === "initial-load";
    if (!(file instanceof File)) {
      throw new ApiError(400, "BAD_REQUEST", "Falta el fichero (campo 'file')");
    }
    if (file.size > MAX_PLAN_BYTES) {
      throw new ApiError(422, "VALIDATION", "El plano supera el tamaño máximo de 15 MB");
    }
    const ext = ALLOWED_EXT[file.type];
    if (!ext) {
      throw new ApiError(422, "VALIDATION", "Formato no admitido (PNG, JPG, WebP o SVG)");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let width: number | undefined;
    let height: number | undefined;

    if (ext === "svg") {
      const result = validateSvg(buffer, svgMaxBytes());
      if (!result.ok) {
        throw new ApiError(422, "VALIDATION", `SVG no admitido: ${result.errors.join("; ")}`);
      }
      width = result.width;
      height = result.height;
    } else {
      try {
        const size = imageSize(buffer);
        width = size.width;
        height = size.height;
      } catch {
        throw new ApiError(422, "VALIDATION", "No se pudo leer la imagen del plano");
      }
    }
    if (!width || !height) {
      throw new ApiError(422, "VALIDATION", "El plano no tiene dimensiones válidas");
    }

    const previous =
      floor.planWidth && floor.planHeight
        ? { w: floor.planWidth, h: floor.planHeight }
        : null;
    const changed = previous !== null && aspectChanged(previous, { w: width, h: height });
    if (changed && !confirmAspect) {
      return jsonOk(
        {
          error: {
            code: "ASPECT_CHANGED",
            message:
              "El nuevo plano tiene una proporción distinta: las posiciones guardadas pueden quedar desplazadas.",
            details: { previous, next: { w: width, h: height } },
          },
        },
        409,
      );
    }

    const uploadsDir = process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads");
    const plansDir = path.join(uploadsDir, "plans");
    mkdirSync(plansDir, { recursive: true });
    const fileName = `${id}-${Date.now()}.${ext}`;
    writeFileSync(path.join(plansDir, fileName), buffer);
    const planFile = `plans/${fileName}`;

    await prisma.floor.update({
      where: { id },
      data: { planFile, planWidth: width, planHeight: height },
    });

    await audit({
      userId: user.id,
      action: fromInitialLoad ? "import.plans" : "floor.plan_upload",
      entity: "Floor",
      entityId: id,
      data: { planFile, width, height, aspectChanged: changed },
      ip: clientIp(req),
    });
    return jsonOk({
      planFile,
      width,
      height,
      aspectChanged: changed,
      previous,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
