import { getPrisma } from "@puestomap/db";
import { parseCsvTable, validatePositions, type Rect } from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const body = (await req.json()) as { csv?: string; dryRun?: boolean };
    if (typeof body.csv !== "string" || body.csv.length === 0) throw new ApiError(422, "VALIDATION", "Falta el CSV");
    const prisma = getPrisma();
    const [computers, offices] = await Promise.all([
      prisma.computer.findMany({ where: { archived: false }, select: { id: true, hostname: true, floorId: true } }),
      prisma.office.findMany({ select: { id: true, code: true, floorId: true, rect: true } }),
    ]);
    const results = validatePositions(
      parseCsvTable(body.csv).rows,
      computers,
      offices.map((o) => ({ ...o, rect: (o.rect as Rect | null) ?? null })),
    );
    const valid = results.filter((r) => r.errors.length === 0);
    if (!body.dryRun) {
      await prisma.$transaction(
        valid.map((r) =>
          prisma.computer.update({
            where: { id: r.computerId! },
            data: { floorId: r.floorId, officeId: r.officeId, posX: r.posX, posY: r.posY },
          }),
        ),
      );
      await audit({
        userId: user.id,
        action: "import.positions",
        entity: "Computer",
        entityId: "positions",
        data: { applied: valid.length, errors: results.length - valid.length },
        ip: clientIp(req),
      });
    }
    return jsonOk({
      dryRun: body.dryRun === true,
      total: results.length,
      applied: body.dryRun ? 0 : valid.length,
      errors: results.filter((r) => r.errors.length > 0).map((r) => ({ line: r.line, hostname: r.hostname, errors: r.errors })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
