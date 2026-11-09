import { getPrisma } from "@puestomap/db";
import { departmentCreateSchema } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole();
    const items = await getPrisma().department.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { computers: true, offices: true } } },
    });
    return jsonOk({ items });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    const input = await parseBody(req, departmentCreateSchema);
    const prisma = getPrisma();
    const existing = await prisma.department.findUnique({ where: { code: input.code } });
    if (existing) throw new ApiError(409, "DUPLICATE", `Ya existe un departamento con código ${input.code}`);

    const department = await prisma.department.create({ data: input });
    await audit({
      userId: user.id,
      action: "department.create",
      entity: "Department",
      entityId: department.id,
      data: { code: department.code },
      ip: clientIp(req),
    });
    return jsonOk(department, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
