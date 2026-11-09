import { getPrisma } from "@puestomap/db";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("TECH", "ADMIN");
    const items = await getPrisma().syncRun.findMany({
      where: { type: "OCS" },
      orderBy: { startedAt: "desc" },
      take: 10,
    });
    return jsonOk({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
