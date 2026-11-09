import { getPrisma } from "@puestomap/db";
import { screensPutSchema, validateScreenList } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole();
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const exists = await prisma.computer.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");
    return jsonOk({
      items: await prisma.computerScreen.findMany({ where: { computerId: id }, orderBy: { index: "asc" } }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const input = await parseBody(req, screensPutSchema);
    const validation = validateScreenList(input);
    if (!validation.ok) throw new ApiError(422, "VALIDATION", validation.errors.join(". "));
    const prisma = getPrisma();
    const exists = await prisma.computer.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new ApiError(404, "NOT_FOUND", "Equipo no encontrado");
    await prisma.$transaction([
      prisma.computerScreen.deleteMany({ where: { computerId: id } }),
      prisma.computerScreen.createMany({
        data: input.map((screen) => ({ ...screen, computerId: id, source: "MANUAL" })),
      }),
    ]);
    await audit({
      userId: user.id,
      action: "screens.update",
      entity: "Computer",
      entityId: id,
      data: { screens: input },
      ip: clientIp(req),
    });
    return GET(req, { params: Promise.resolve({ id }) });
  } catch (error) {
    return errorResponse(error);
  }
}
