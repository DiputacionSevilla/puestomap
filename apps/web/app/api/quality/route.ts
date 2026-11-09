import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { loadQualitySnapshot } from "@/lib/quality";

export async function GET() {
  try {
    await requireRole("TECH", "ADMIN");
    const { checks, byBuilding } = await loadQualitySnapshot();
    return jsonOk({ checks, byBuilding });
  } catch (error) {
    return errorResponse(error);
  }
}
