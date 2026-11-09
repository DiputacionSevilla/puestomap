import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCsvTable,
  validateComputerImport,
  validateDirectoryImport,
  validateStructureImport,
  validateSvg,
  type ComputerImportCtx,
  type StructureCtx,
} from "@puestomap/shared";

const root = path.resolve(process.cwd(), "apps/web/test/fixtures/carga-ayto");
const read = (name: string) => readFileSync(path.join(root, name), "utf8");

describe("T-I5 carga Ayuntamiento", () => {
  it("contiene 3 planos SVG seguros, 18 despachos y 36 equipos (15 + 13 + 8)", () => {
    for (const name of ["AYTO__PLANTA-BAJA.svg", "AYTO__PLANTA-1.svg", "AYTO__PLANTA-2.svg"]) {
      expect(validateSvg(read(`planos/${name}`), 2 * 1024 * 1024).ok).toBe(true);
    }
    const structureRows = parseCsvTable(read("estructura.csv")).rows;
    expect(structureRows.filter((row) => row.tipo === "PLANTA")).toHaveLength(3);
    expect(structureRows.filter((row) => row.tipo === "DESPACHO")).toHaveLength(18);
    const computers = parseCsvTable(read("equipos-ejemplo.csv")).rows;
    expect(computers).toHaveLength(36);
    expect(computers.filter((row) => row.planta_nombre === "Planta baja")).toHaveLength(15);
    expect(computers.filter((row) => row.planta_nombre === "Planta 1")).toHaveLength(13);
    expect(computers.filter((row) => row.planta_nombre === "Planta 2")).toHaveLength(8);
  });

  it("previsualiza la carga completa y la segunda pasada produce cero cambios", () => {
    const source = parseCsvTable(read("estructura.csv")).rows;
    const empty: StructureCtx = { buildings: [], departments: [] };
    const firstStructure = validateStructureImport(source, empty);
    expect(firstStructure.every((row) => row.errors.length === 0)).toBe(true);
    const floorNames = ["Planta baja", "Planta 1", "Planta 2"];
    const structure: StructureCtx = {
      buildings: [{
        id: "building-ayto", code: "AYTO", name: "Ayuntamiento",
        floors: floorNames.map((name, index) => ({
          id: `floor-${index}`, name, planFile: `planos/${index}.svg`,
          offices: source.filter((row) => row.tipo === "DESPACHO" && row.planta_nombre === name).map((row) => ({
            id: `office-${row.codigo}`, code: row.codigo, name: row.nombre,
            departmentId: `department-${row.departamento_codigo}`,
            rect: { x: Number(row.rect_x), y: Number(row.rect_y), w: Number(row.rect_w), h: Number(row.rect_h) },
          })),
        })),
      }],
      departments: [
        { id: "department-ADM", code: "ADM", name: "Administracion" },
        { id: "department-TEC", code: "TEC", name: "Servicios tecnicos" },
        { id: "department-CIU", code: "CIU", name: "Atencion ciudadana" },
      ],
    };
    const secondStructure = validateStructureImport(source, structure);
    expect(secondStructure.every((row) => row.action === "sin cambios")).toBe(true);

    const directory = validateDirectoryImport(parseCsvTable(read("ad-usuarios-ejemplo.csv")).rows, []);
    expect(directory.every((row) => row.errors.length === 0)).toBe(true);
    const rows = parseCsvTable(read("equipos-ejemplo.csv")).rows;
    const base: ComputerImportCtx = {
      ...structure,
      credentials: [], computers: [], directoryEmpty: true,
      directoryUsernames: new Set(), adUsers: new Map(),
    };
    const first = validateComputerImport(rows, base, { crearEquipos: true });
    expect(first).toHaveLength(36);
    expect(first.every((row) => row.action === "crear" && row.errors.length === 0 && row.values.floorId && row.values.posX !== undefined)).toBe(true);
    const existing = first.map((row, index) => ({
      id: `computer-${index}`, hostname: row.values.hostname, ip: row.values.ip ?? null, ocsId: null,
      assignedTo: row.values.assignedTo ?? null, adUsername: row.values.adUsername ?? null,
      floorId: row.values.floorId ?? null, officeId: row.values.officeId ?? null,
      departmentId: row.values.departmentId ?? null, posX: row.values.posX ?? null, posY: row.values.posY ?? null,
      vncPort: row.values.vncPort ?? 5900, notes: row.values.notes ?? null,
      assetTag: row.values.assetTag ?? null, phoneExt: row.values.phoneExt ?? null,
    }));
    const second = validateComputerImport(rows, { ...base, computers: existing }, { crearEquipos: true });
    expect(second.every((row) => row.action === "sin cambios" && row.errors.length === 0)).toBe(true);
  });
});
