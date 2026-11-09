import { parse as parseCsv } from "papaparse";
import { getPrisma } from "@puestomap/db";
import {
  normalizeCsvRows,
  type ComputerCsvRow,
  type ComputerCsvRowResult,
  type KnownStructure,
} from "@puestomap/shared";

export function parseComputerCsv(text: string): ComputerCsvRow[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const result = parseCsv<string[]>(cleaned, {
    delimiter: ";",
    skipEmptyLines: true,
  });
  const [headers, ...rows] = result.data;
  if (!headers) return [];
  return normalizeCsvRows(headers.map((h) => h.trim()), rows);
}

export async function loadKnownStructure(): Promise<KnownStructure> {
  const prisma = getPrisma();
  const [buildings, floors, offices, departments, credentials] = await Promise.all([
    prisma.building.findMany({ select: { id: true, code: true } }),
    prisma.floor.findMany({ select: { id: true, buildingId: true, name: true } }),
    prisma.office.findMany({ select: { id: true, floorId: true, code: true } }),
    prisma.department.findMany({ select: { id: true, code: true } }),
    prisma.vncCredential.findMany({ select: { id: true, name: true } }),
  ]);
  return { buildings, floors, offices, departments, credentials };
}

export function summarize(results: ComputerCsvRowResult[]) {
  const valid = results.filter((r) => r.errors.length === 0);
  const invalid = results.filter((r) => r.errors.length > 0);
  return {
    total: results.length,
    valid: valid.length,
    invalid: invalid.length,
  };
}

export async function resolveStructureIds(values: {
  buildingCode?: string;
  floorName?: string;
  officeCode?: string;
  departmentCode?: string;
  credentialName?: string;
}): Promise<{
  floorId: string | null;
  officeId: string | null;
  departmentId: string | null;
  credentialId: string | null;
}> {
  const prisma = getPrisma();
  let floorId: string | null = null;
  let officeId: string | null = null;
  let departmentId: string | null = null;
  let credentialId: string | null = null;

  if (values.buildingCode) {
    let building = await prisma.building.findUnique({ where: { code: values.buildingCode } });
    if (!building) {
      building = await prisma.building.create({
        data: { code: values.buildingCode, name: values.buildingCode },
      });
    }
    if (values.floorName) {
      let floor = await prisma.floor.findUnique({
        where: { buildingId_name: { buildingId: building.id, name: values.floorName } },
      });
      if (!floor) {
        floor = await prisma.floor.create({
          data: { buildingId: building.id, name: values.floorName },
        });
      }
      floorId = floor.id;

      if (values.officeCode) {
        let office = await prisma.office.findUnique({
          where: { floorId_code: { floorId: floor.id, code: values.officeCode } },
        });
        if (!office) {
          office = await prisma.office.create({
            data: {
              floorId: floor.id,
              code: values.officeCode,
              name: values.officeCode,
              departmentId: null,
            },
          });
        }
        officeId = office.id;
      }
    }
  }

  if (values.departmentCode) {
    let department = await prisma.department.findUnique({
      where: { code: values.departmentCode },
    });
    if (!department) {
      department = await prisma.department.create({
        data: { code: values.departmentCode, name: values.departmentCode },
      });
    }
    departmentId = department.id;
  }

  if (values.credentialName) {
    const credential = await prisma.vncCredential.findUnique({
      where: { name: values.credentialName },
      select: { id: true },
    });
    credentialId = credential?.id ?? null;
  }

  return { floorId, officeId, departmentId, credentialId };
}

export type ComputerUpsertPlan = {
  line: number;
  hostname: string;
  values: NonNullable<ComputerCsvRowResult["values"]>;
  ids: Awaited<ReturnType<typeof resolveStructureIds>>;
};

export type StructureRow = {
  tipo: string;
  codigo: string;
  nombre: string;
  edificio_codigo: string;
  planta_nombre: string;
  nivel: string;
  departamento_codigo: string;
};

export function parseStructureCsv(text: string): StructureRow[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const result = parseCsv<string[]>(cleaned, { delimiter: ";", skipEmptyLines: true });
  const [headers, ...rows] = result.data;
  if (!headers) return [];
  const keys = headers.map((h) => h.trim().toLowerCase());
  return rows.map((cells) => {
    const row: Record<string, string> = {};
    keys.forEach((key, i) => {
      row[key] = (cells[i] ?? "").trim();
    });
    return row as unknown as StructureRow;
  });
}

export function validateStructureRows(rows: StructureRow[]): {
  line: number;
  errors: string[];
  data: StructureRow | null;
}[] {
  return rows.map((row, i) => {
    const line = i + 2;
    const errors: string[] = [];
    const tipo = row.tipo.toUpperCase();
    if (!["EDIFICIO", "PLANTA", "DEPARTAMENTO", "DESPACHO"].includes(tipo)) {
      errors.push(`tipo desconocido: ${row.tipo}`);
    }
    if (tipo !== "PLANTA" && !row.codigo) errors.push("codigo obligatorio");
    if (!row.nombre) errors.push("nombre obligatorio");
    if (tipo === "PLANTA") {
      if (!row.edificio_codigo) errors.push("PLANTA requiere edificio_codigo");
      if (!row.planta_nombre) errors.push("PLANTA requiere planta_nombre");
    }
    if (tipo === "DESPACHO") {
      if (!row.edificio_codigo) errors.push("DESPACHO requiere edificio_codigo");
      if (!row.planta_nombre) errors.push("DESPACHO requiere planta_nombre");
      if (!row.codigo) errors.push("DESPACHO requiere codigo");
    }
    return { line, errors, data: errors.length > 0 ? null : row };
  });
}
