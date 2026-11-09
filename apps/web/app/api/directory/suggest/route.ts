import { getPrisma } from "@puestomap/db";
import { suggestDirectoryUsers } from "@puestomap/shared";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";

export async function GET(req: Request) {
  try {
    await requireRole("TECH", "ADMIN");
    const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
    const users = await getPrisma().directoryUser.findMany({
      where: { active: true },
      select: { username: true, displayName: true, givenName: true, surname: true, searchName: true, department: true },
    });
    const departments = new Map(users.map((user) => [user.username, user.department]));
    return jsonOk({ suggestions: suggestDirectoryUsers(name, users).map((entry) => ({ ...entry, department: departments.get(entry.username) ?? null })) });
  } catch (error) {
    return errorResponse(error);
  }
}
