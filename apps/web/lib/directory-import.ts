import { getPrisma } from "@puestomap/db";
import { parseCsvTable, validateDirectoryImport, type DirectoryRowResult } from "@puestomap/shared";

export async function previewDirectory(csv: string): Promise<DirectoryRowResult[]> {
  const prisma = getPrisma();
  const existing = await prisma.directoryUser.findMany({
    select: {
      username: true,
      displayName: true,
      givenName: true,
      surname: true,
      department: true,
      title: true,
      office: true,
      phone: true,
      searchName: true,
    },
  });
  return validateDirectoryImport(parseCsvTable(csv).rows, existing);
}

export function directorySummary(rows: DirectoryRowResult[]) {
  return {
    total: rows.length,
    crear: rows.filter((row) => row.action === "crear").length,
    actualizar: rows.filter((row) => row.action === "actualizar").length,
    sinCambios: rows.filter((row) => row.action === "sin cambios").length,
    errores: rows.filter((row) => row.errors.length > 0).length,
  };
}
