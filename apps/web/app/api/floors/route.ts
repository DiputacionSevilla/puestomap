import { getPrisma } from "@puestomap/db";
import { floorCreateSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole();
    const url = new URL(req.url);
    const buildingId = url.searchParams.get("buildingId") ?? undefined;
    const items = await getPrisma().floor.findMany({
      where: buildingId ? { buildingId } : undefined,
      orderBy: [{ building: { name: "asc" } }, { level: "asc" }],
      include: {
        building: { select: { id: true, code: true, name: true } },
        _count: { select: { computers: true, offices: true } },
      },
    });
    return jsonOk({ items });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    const input = await parseBody(req, floorCreateSchema);
    const prisma = getPrisma();
    const building = await prisma.building.findUnique({ where: { id: input.buildingId } });
    if (!building) throw new ApiError(422, "VALIDATION", "Edificio no encontrado");

    const existing = await prisma.floor.findUnique({
      where: { buildingId_name: { buildingId: input.buildingId, name: input.name } },
    });
    if (existing) {
      throw new ApiError(409, "DUPLICATE", `Ya existe la planta ${input.name} en ${building.name}`);
    }

    const floor = await prisma.floor.create({
      data: {
        buildingId: input.buildingId,
        name: input.name,
        level: input.level ?? 0,
      },
    });
    await audit({
      userId: user.id,
      action: "floor.create",
      entity: "Floor",
      entityId: floor.id,
      data: { name: floor.name, buildingId: floor.buildingId },
      ip: clientIp(req),
    });
    return jsonOk(floor, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
