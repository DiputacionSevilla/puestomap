import { getPrisma } from "@puestomap/db";
import {
  computerCreateSchema,
  computersListQuerySchema,
  normalizeHostname,
} from "@puestomap/shared";
import { ApiError, errorResponse, jsonOk, parseBody, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import {
  buildComputersWhere,
  buildOrderBy,
  computerListInclude,
  deriveMultiStateFrom,
  toListItem,
} from "@/lib/computers";
import { validatePlacement } from "@/lib/placement";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole();
    const url = new URL(req.url);
    const query = computersListQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    );
    const prisma = getPrisma();
    const where = buildComputersWhere(query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    if (query.multiPending === true) {
      const rows = await prisma.computer.findMany({
        where,
        include: computerListInclude,
        orderBy: buildOrderBy(query),
      });
      const filtered = rows.filter((row) => deriveMultiStateFrom(row) === "MULTI_PENDING");
      const items = filtered.slice((page - 1) * pageSize, page * pageSize).map(toListItem);
      return jsonOk({ items, total: filtered.length, page, pageSize });
    }

    const [total, rows] = await Promise.all([
      prisma.computer.count({ where }),
      prisma.computer.findMany({
        where,
        include: computerListInclude,
        orderBy: buildOrderBy(query),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return jsonOk({ items: rows.map(toListItem), total, page, pageSize });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const input = await parseBody(req, computerCreateSchema);
    const hostname = normalizeHostname(input.hostname);
    const prisma = getPrisma();

    const existing = await prisma.computer.findUnique({ where: { hostname } });
    if (existing) {
      throw new ApiError(409, "DUPLICATE", `Ya existe un equipo con hostname ${hostname}`);
    }

    const placement = await validatePlacement(input);
    const computer = await prisma.computer.create({
      data: {
        hostname,
        source: "MANUAL",
        ip: input.ip ?? null,
        mac: input.mac ?? null,
        assignedTo: input.assignedTo ?? null,
        phoneExt: input.phoneExt ?? null,
        notes: input.notes ?? null,
        assetTag: input.assetTag ?? null,
        serial: input.serial ?? null,
        vncPort: input.vncPort ?? 5900,
        credentialId: input.credentialId ?? null,
        vncOverride: input.vncOverride ?? null,
        ...placement,
      },
    });
    await audit({
      userId: user.id,
      action: "computer.create",
      entity: "Computer",
      entityId: computer.id,
      data: { hostname: computer.hostname },
      ip: clientIp(req),
    });
    return jsonOk({ id: computer.id, hostname: computer.hostname }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
