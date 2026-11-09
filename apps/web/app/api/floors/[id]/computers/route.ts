import { getPrisma } from "@puestomap/db";
import { deriveUserMatch, deriveVncState } from "@puestomap/shared";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole();
    const { id } = await ctx.params;
    const prisma = getPrisma();
    const rows = await prisma.computer.findMany({
      where: { floorId: id, archived: false },
      orderBy: { hostname: "asc" },
      select: {
        id: true,
        hostname: true,
        ip: true,
        lastUser: true,
        lastUserNorm: true,
        adUsername: true,
        assignedTo: true,
        posX: true,
        posY: true,
        online: true,
        vncReachable: true,
        vncInstalled: true,
        vncOverride: true,
        monitorCount: true,
        officeId: true,
        departmentId: true,
      },
    });
    const adUsernames = rows.map((r) => r.adUsername).filter((u): u is string => Boolean(u));
    const directory = adUsernames.length
      ? await prisma.directoryUser.findMany({
          where: { username: { in: adUsernames } },
          select: { username: true, displayName: true },
        })
      : [];
    const directoryNames = new Map(directory.map((d) => [d.username, d.displayName]));

    const items = rows.map((row) => ({
      ...row,
      state: deriveVncState({
        online: row.online,
        vncReachable: row.vncReachable,
        vncInstalled: row.vncInstalled,
        vncOverride: row.vncOverride,
      }),
      userMatch: deriveUserMatch(row),
      directoryName: row.adUsername ? (directoryNames.get(row.adUsername) ?? null) : null,
    }));
    return jsonOk({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
