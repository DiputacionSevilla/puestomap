import { describe, expect, it } from "vitest";
import {
  computerErrorsCsv,
  parseCsvTable,
  validateComputerImport,
  validateStructureImport,
  type ComputerImportCtx,
  type StructureCtx,
} from "@puestomap/shared";

const structureCtx: StructureCtx = {
  buildings: [
    {
      id: "b1",
      code: "AYTO",
      name: "Ayuntamiento",
      floors: [
        {
          id: "f1",
          name: "Planta baja",
          planFile: "plans/f1.svg",
          offices: [
            { id: "o1", code: "PB-01", name: "Despacho 1", departmentId: null, rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
          ],
        },
      ],
    },
  ],
  departments: [{ id: "d1", code: "INTERV" }],
};

const computerCtx: ComputerImportCtx = {
  buildings: structureCtx.buildings,
  departments: structureCtx.departments,
  credentials: [{ id: "c1", name: "Estándar 2024" }],
  computers: [
    {
      id: "pc1",
      hostname: "PC-INT-01",
      ip: "10.1.2.34",
      ocsId: 123,
      assignedTo: "María López",
      adUsername: "mlopez",
      floorId: "f1",
      officeId: "o1",
      departmentId: null,
      posX: 0.42,
      posY: 0.33,
      vncPort: 5900,
      notes: null,
      assetTag: null,
      phoneExt: null,
    },
  ],
  directoryUsernames: new Set(["mlopez", "jgarcia"]),
  directoryEmpty: false,
  adUsers: new Map([["mlopez", "María López"], ["jgarcia", "Juan García"]]),
};

function row(map: Record<string, string>) {
  return map;
}

describe("importación CR-01 (T-U10+)", () => {
  it("parseCsvTable lee por cabecera con tildes/mayúsculas y comillas", () => {
    const { rows } = parseCsvTable(
      "\uFEFFHostName;Usuario_Dominio;Notas\r\nPC-01;AYTO\\jgarcia;\"Con; punto y coma\"\r\n",
    );
    expect(rows[0].hostname).toBe("PC-01");
    expect(rows[0].usuario_dominio).toBe("AYTO\\jgarcia");
    expect(rows[0].notas).toBe("Con; punto y coma");
  });

  it("estructura: rect válido, inválido y planta con distinta capitalización", () => {
    const results = validateStructureImport(
      [
        row({ tipo: "DESPACHO", codigo: "PB-02", nombre: "Despacho 2", edificio_codigo: "AYTO", planta_nombre: "PLANTA-BAJA", rect_x: "0.5", rect_y: "0.5", rect_w: "0.2", rect_h: "0.2" }),
        row({ tipo: "DESPACHO", codigo: "PB-03", nombre: "Despacho 3", edificio_codigo: "AYTO", planta_nombre: "Planta baja", rect_x: "0.9", rect_y: "0.9", rect_w: "0.3", rect_h: "0.2" }),
        row({ tipo: "PLANTA", codigo: "", nombre: "Planta Baja", edificio_codigo: "AYTO", planta_nombre: "Planta Baja", nivel: "0" }),
      ],
      structureCtx,
    );
    expect(results[0].errors).toEqual([]);
    expect(results[0].values.rect).toEqual({ x: 0.5, y: 0.5, w: 0.2, h: 0.2 });
    expect(results[1].errors.some((e) => e.code === "RECT_INVALIDO")).toBe(true);
    expect(results[2].errors).toEqual([]);
    expect(results[2].action).toBe("sin cambios");
  });

  it("estructura: reimportar = 0 cambios", () => {
    const results = validateStructureImport(
      [
        row({ tipo: "EDIFICIO", codigo: "AYTO", nombre: "Ayuntamiento" }),
        row({ tipo: "DESPACHO", codigo: "PB-01", nombre: "Despacho 1", edificio_codigo: "AYTO", planta_nombre: "Planta baja", rect_x: "0.1", rect_y: "0.1", rect_w: "0.2", rect_h: "0.2" }),
      ],
      structureCtx,
    );
    expect(results.every((r) => r.action === "sin cambios")).toBe(true);
  });

  it("equipos: crea desconocidos, hostname duplicado y usuario normalizado", () => {
    const results = validateComputerImport(
      [
        row({ hostname: "PC-NUEVO-01", usuario_dominio: "AYTO\\JGarcia", edificio_codigo: "AYTO", planta_nombre: "Planta baja", pos_x: "0.15", pos_y: "0.15" }),
        row({ hostname: "PC-NUEVO-01" }),
        row({ hostname: "PC-NUEVO-02", usuario_dominio: "pepito@ayto.local" }),
      ],
      computerCtx,
      { crearEquipos: true },
    );
    expect(results[0].action).toBe("crear");
    expect(results[0].values.adUsername).toBe("jgarcia");
    expect(results[0].values.assignedTo).toBe("Juan García");
    expect(results[0].warnings.some((w) => w.code === "DESPACHO_INFERIDO")).toBe(true);
    expect(results[1].errors.some((e) => e.code === "HOSTNAME_DUPLICADO")).toBe(true);
    expect(results[2].values.adUsername).toBe("pepito");
    expect(results[2].warnings.some((w) => w.code === "USUARIO_FUERA_DIRECTORIO")).toBe(true);
  });

  it("equipos: IP gestionada por OCS se omite con aviso", () => {
    const results = validateComputerImport(
      [row({ hostname: "PC-INT-01", ip: "10.9.9.9" })],
      computerCtx,
      { crearEquipos: true },
    );
    expect(results[0].values.ip).toBeUndefined();
    expect(results[0].warnings.some((w) => w.code === "IP_GESTIONADA_POR_OCS")).toBe(true);
  });

  it("equipos: despacho de otra planta → error", () => {
    const results = validateComputerImport(
      [row({ hostname: "PC-OTRO", planta_nombre: "Segunda", despacho_codigo: "PB-01" })],
      computerCtx,
      { crearEquipos: true },
    );
    expect(results[0].errors.some((e) => e.code === "DESPACHO_OTRA_PLANTA" || e.code === "PLANTA_NO_ENCONTRADA")).toBe(true);
  });

  it("equipos: reimportar = 0 cambios", () => {
    const results = validateComputerImport(
      [
        row({
          hostname: "pc-int-01",
          ip: "10.1.2.34",
          asignado_a: "María López",
          usuario_dominio: "mlopez",
          despacho_codigo: "PB-01",
          planta_nombre: "Planta baja",
          pos_x: "0.42",
          pos_y: "0.33",
        }),
      ],
      computerCtx,
      { crearEquipos: true },
    );
    expect(results[0].action).toBe("sin cambios");
    expect(results[0].errors).toEqual([]);
  });

  it("errores.csv contiene línea, código y columnas originales", () => {
    const results = validateComputerImport(
      [row({ hostname: "", ip: "no-ip", notas: "revisar" })],
      computerCtx,
      { crearEquipos: true },
    );
    const csv = computerErrorsCsv(results);
    expect(csv).toContain("linea;codigo_error;detalle");
    expect(csv).toContain("HOSTNAME_VACIO");
    expect(csv).toContain("revisar");
  });
});
