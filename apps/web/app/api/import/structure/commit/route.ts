import { getPrisma } from "@puestomap/db";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { parseStructureCsv, validateStructureRows } from "@/lib/import-csv";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    const body = (await req.json()) as { csv?: string };
    if (typeof body.csv !== "string" || body.csv.length === 0) {
      return jsonOk({ error: { code: "VALIDATION", message: "Falta el CSV" } }, 422);
    }
    const rows = parseStructureCsv(body.csv);
    const results = validateStructureRows(rows);
    const prisma = getPrisma();

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const result of results) {
      if (!result.data) {
        errors += 1;
        continue;
      }
      const row = result.data;
      const tipo = row.tipo.toUpperCase();
      try {
        if (tipo === "EDIFICIO") {
          const existing = await prisma.building.findUnique({ where: { code: row.codigo } });
          if (existing) {
            await prisma.building.update({
              where: { id: existing.id },
              data: { name: row.nombre },
            });
            updated += 1;
          } else {
            await prisma.building.create({ data: { code: row.codigo, name: row.nombre } });
            created += 1;
          }
        } else if (tipo === "DEPARTAMENTO") {
          const existing = await prisma.department.findUnique({ where: { code: row.codigo } });
          if (existing) {
            await prisma.department.update({ where: { id: existing.id }, data: { name: row.nombre } });
            updated += 1;
          } else {
            await prisma.department.create({ data: { code: row.codigo, name: row.nombre } });
            created += 1;
          }
        } else if (tipo === "PLANTA") {
          const building = await prisma.building.findUnique({ where: { code: row.edificio_codigo } });
          if (!building) throw new Error(`edificio desconocido: ${row.edificio_codigo}`);
          const name = row.planta_nombre || row.nombre;
          const existing = await prisma.floor.findUnique({
            where: { buildingId_name: { buildingId: building.id, name } },
          });
          const data = { name, level: Number(row.nivel) || 0 };
          if (existing) {
            await prisma.floor.update({ where: { id: existing.id }, data });
            updated += 1;
          } else {
            await prisma.floor.create({ data: { buildingId: building.id, ...data } });
            created += 1;
          }
        } else if (tipo === "DESPACHO") {
          const building = await prisma.building.findUnique({ where: { code: row.edificio_codigo } });
          if (!building) throw new Error(`edificio desconocido: ${row.edificio_codigo}`);
          const floor = await prisma.floor.findUnique({
            where: { buildingId_name: { buildingId: building.id, name: row.planta_nombre } },
          });
          if (!floor) throw new Error(`planta desconocida: ${row.planta_nombre}`);
          let departmentId: string | null = null;
          if (row.departamento_codigo) {
            const department = await prisma.department.findUnique({
              where: { code: row.departamento_codigo },
            });
            departmentId = department?.id ?? null;
          }
          const existing = await prisma.office.findUnique({
            where: { floorId_code: { floorId: floor.id, code: row.codigo } },
          });
          if (existing) {
            await prisma.office.update({
              where: { id: existing.id },
              data: { name: row.nombre, departmentId },
            });
            updated += 1;
          } else {
            await prisma.office.create({
              data: {
                floorId: floor.id,
                code: row.codigo,
                name: row.nombre,
                departmentId,
              },
            });
            created += 1;
          }
        }
      } catch {
        errors += 1;
      }
    }

    const summary = { created, updated, errors, total: results.length };
    await audit({
      userId: user.id,
      action: "import.structure",
      data: summary as unknown as Record<string, unknown>,
      ip: clientIp(req),
    });
    return jsonOk(summary);
  } catch (err) {
    return errorResponse(err);
  }
}
