import { getPrisma } from "@puestomap/db";
import { buildingCreateSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole();
    const buildings = await getPrisma().building.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        floors: {
          orderBy: { level: "asc" },
          include: { _count: { select: { computers: true, offices: true } } },
        },
        _count: { select: { floors: true } },
      },
    });
    return jsonOk({ items: buildings });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    const input = await parseBody(req, buildingCreateSchema);
    const prisma = getPrisma();
    const existing = await prisma.building.findUnique({ where: { code: input.code } });
    if (existing) throw new ApiError(409, "DUPLICATE", `Ya existe un edificio con código ${input.code}`);

    const building = await prisma.building.create({
      data: {
        code: input.code,
        name: input.name,
        address: input.address ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    await audit({
      userId: user.id,
      action: "building.create",
      entity: "Building",
      entityId: building.id,
      data: { code: building.code },
      ip: clientIp(req),
    });
    return jsonOk(building, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
