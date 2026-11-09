import { imageSize } from "image-size";
import { getPrisma } from "@puestomap/db";
import { normKey, validateSvg } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, requireRole } from "@/lib/api";

const MAX_IMAGE = 15 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");
    const form = await req.formData();
    const files = form.getAll("files").filter((file): file is File => file instanceof File);
    if (!files.length) throw new ApiError(422, "VALIDATION", "No se han enviado planos");
    const buildings = await getPrisma().building.findMany({ include: { floors: true } });
    const results = await Promise.all(files.map(async (file) => {
      const errors: string[] = [];
      let width: number | undefined;
      let height: number | undefined;
      if (file.size > MAX_IMAGE) errors.push("El fichero supera 15 MB");
      const buffer = Buffer.from(await file.arrayBuffer());
      if (file.type === "image/svg+xml") {
        const svg = validateSvg(buffer, Number(process.env.SVG_MAX_MB ?? 2) * 1024 * 1024);
        errors.push(...svg.errors);
        width = svg.width;
        height = svg.height;
      } else if (["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        try {
          const size = imageSize(buffer);
          width = size.width;
          height = size.height;
        } catch {
          errors.push("No se pudo leer la imagen");
        }
      } else errors.push("Formato no admitido");
      const [buildingCode, floorName] = file.name.replace(/\.[^.]+$/, "").split("__");
      const building = buildings.find((entry) => normKey(entry.code) === normKey(buildingCode ?? ""));
      const floor = building?.floors.find((entry) => normKey(entry.name) === normKey(floorName ?? ""));
      return { fileName: file.name, matchedFloorId: floor?.id, width, height, errors, warnings: floor ? [] : ["No se pudo asignar automáticamente"] };
    }));
    return jsonOk(results);
  } catch (error) {
    return errorResponse(error);
  }
}
