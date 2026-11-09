import { getPrisma } from "@puestomap/db";
import { computerBulkSchema, computersListQuerySchema } from "@puestomap/shared";
import { errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { buildComputersWhere } from "@/lib/computers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    const input = await parseBody(req, computerBulkSchema);
    const prisma = getPrisma();

    let ids = input.ids ?? [];
    if (input.filter) {
      const query = computersListQuerySchema.parse(input.filter);
      const rows = await prisma.computer.findMany({
        where: buildComputersWhere(query),
        select: { id: true },
      });
      ids = rows.map((r) => r.id);
    }

    const data: { credentialId?: string | null; departmentId?: string | null } = {};
    if (input.set.credentialId !== undefined) data.credentialId = input.set.credentialId;
    if (input.set.departmentId !== undefined) data.departmentId = input.set.departmentId;

    const result = await prisma.computer.updateMany({
      where: { id: { in: ids } },
      data,
    });

    await audit({
      userId: user.id,
      action: "computer.bulk_update",
      entity: "Computer",
      data: { count: result.count, set: data },
      ip: clientIp(req),
    });
    return jsonOk({ updated: result.count });
  } catch (err) {
    return errorResponse(err);
  }
}
