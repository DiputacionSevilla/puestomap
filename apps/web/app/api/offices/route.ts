import { getPrisma } from "@puestomap/db";
import type { Prisma } from "@puestomap/db";
import { officeCreateSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole();
    const url = new URL(req.url);
    const floorId = url.searchParams.get("floorId") ?? undefined;
    const items = await getPrisma().office.findMany({
      where: floorId ? { floorId } : undefined,
      orderBy: [{ floor: { building: { name: "asc" } } }, { code: "asc" }],
      include: {
        floor: { select: { id: true, name: true, building: { select: { name: true } } } },
        department: { select: { id: true, code: true, name: true } },
        _count: { select: { computers: true } },
      },
    });
    return jsonOk({ items });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const input = await parseBody(req, officeCreateSchema);
    const prisma = getPrisma();
    const floor = await prisma.floor.findUnique({ where: { id: input.floorId } });
    if (!floor) throw new ApiError(422, "VALIDATION", "Planta no encontrada");

    const existing = await prisma.office.findUnique({
      where: { floorId_code: { floorId: input.floorId, code: input.code } },
    });
    if (existing) {
      throw new ApiError(409, "DUPLICATE", `Ya existe el despacho ${input.code} en la planta`);
    }

    const office = await prisma.office.create({
      data: {
        floorId: input.floorId,
        code: input.code,
        name: input.name,
        departmentId: input.departmentId ?? null,
        rect: (input.rect ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await audit({
      userId: user.id,
      action: "office.create",
      entity: "Office",
      entityId: office.id,
      data: { code: office.code },
      ip: clientIp(req),
    });
    return jsonOk(office, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
