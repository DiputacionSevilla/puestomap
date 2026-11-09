import { getPrisma } from "@puestomap/db";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";

export async function GET(req: Request) {
  try {
    await requireRole("TECH", "ADMIN");
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    const users = await getPrisma().directoryUser.findMany({
      where: {
        active: true,
        ...(q ? { OR: [
          { username: { contains: q, mode: "insensitive" as const } },
          { displayName: { contains: q, mode: "insensitive" as const } },
        ] } : {}),
      },
      select: { username: true, displayName: true, department: true, phone: true, title: true, office: true },
      orderBy: { displayName: "asc" },
      take: 10,
    });
    return jsonOk({ users });
  } catch (error) {
    return errorResponse(error);
  }
}
