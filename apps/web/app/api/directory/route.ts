import { getPrisma } from "@puestomap/db";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";

export async function DELETE(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    const result = await getPrisma().directoryUser.deleteMany();
    await audit({ userId: user.id, action: "directory.clear", entity: "DirectoryUser", data: { deleted: result.count }, ip: clientIp(req) });
    return jsonOk({ deleted: result.count });
  } catch (error) {
    return errorResponse(error);
  }
}
