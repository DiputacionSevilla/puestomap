import { getPrisma } from "@puestomap/db";
import { ApiError } from "@/lib/api";

export type PlacementInput = {
  floorId?: string | null;
  officeId?: string | null;
  departmentId?: string | null;
  posX?: number | null;
  posY?: number | null;
};

export type PlacementResolved = {
  floorId: string | null;
  officeId: string | null;
  departmentId: string | null;
  posX: number | null;
  posY: number | null;
};

export async function validatePlacement(input: PlacementInput): Promise<PlacementResolved> {
  const prisma = getPrisma();
  let floorId = input.floorId ?? null;
  const officeId = input.officeId ?? null;
  let departmentId = input.departmentId ?? null;
  const posX = input.posX ?? null;
  const posY = input.posY ?? null;

  if ((posX != null || posY != null) && !floorId) {
    throw new ApiError(422, "VALIDATION", "posX/posY solo tienen sentido con una planta (floorId)");
  }
  if (posX != null && (posX < 0 || posX > 1)) {
    throw new ApiError(422, "VALIDATION", "posX fuera de rango 0..1");
  }
  if (posY != null && (posY < 0 || posY > 1)) {
    throw new ApiError(422, "VALIDATION", "posY fuera de rango 0..1");
  }

  if (floorId) {
    const floor = await prisma.floor.findUnique({ where: { id: floorId }, select: { id: true } });
    if (!floor) throw new ApiError(422, "VALIDATION", "Planta no encontrada");
  }
  if (departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!department) throw new ApiError(422, "VALIDATION", "Departamento no encontrado");
  }

  if (officeId) {
    const office = await prisma.office.findUnique({
      where: { id: officeId },
      select: { floorId: true, departmentId: true },
    });
    if (!office) throw new ApiError(422, "VALIDATION", "Despacho no encontrado");
    if (floorId && office.floorId !== floorId) {
      throw new ApiError(422, "VALIDATION", "El despacho no pertenece a la planta indicada");
    }
    floorId = office.floorId;
    if (office.departmentId && departmentId == null) {
      departmentId = office.departmentId;
    }
  }

  return { floorId, officeId, departmentId, posX, posY };
}
