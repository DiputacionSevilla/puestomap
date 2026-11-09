import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { discoverComputerScreens } from "@/lib/screens";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("TECH", "ADMIN");
    const { id } = await ctx.params;
    const items = await discoverComputerScreens(id);
    await audit({
      userId: user.id,
      action: "screens.discover",
      entity: "Computer",
      entityId: id,
      data: { found: items.filter((screen) => screen.reachable).length },
      ip: clientIp(req),
    });
    return jsonOk({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
