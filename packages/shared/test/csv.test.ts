import { describe, expect, it } from "vitest";
import {
  computersToCsv,
  normalizeCsvRows,
  validateComputerCsvRows,
  type KnownStructure,
} from "@puestomap/shared";

const known: KnownStructure = {
  buildings: [{ id: "b1", code: "CASA-CONSIST" }],
  floors: [
    { id: "f1", buildingId: "b1", name: "Primera" },
    { id: "f2", buildingId: "b1", name: "Segunda" },
  ],
  offices: [{ id: "o1", floorId: "f1", code: "P1-07" }],
  departments: [{ id: "d1", code: "INTERV" }],
  credentials: [{ id: "c1", name: "Estándar 2024" }],
};

const base = {
  hostname: "PC-INT-01",
  ip: "10.1.2.34",
  asignado_a: "María López",
  extension: "2104",
  edificio_codigo: "CASA-CONSIST",
  planta_nombre: "Primera",
  despacho_codigo: "P1-07",
  departamento_codigo: "INTERV",
  pos_x: "0.4215",
  pos_y: "0.3380",
  puerto_vnc: "5900",
  credencial: "Estándar 2024",
  notas: "",
  asset_tag: "INV-00123",
};

describe("import/computers (T-U10)", () => {
  it("fila válida sin errores", () => {
    const result = validateComputerCsvRows([base], known, { createMissing: false });
    expect(result[0].errors).toEqual([]);
    expect(result[0].values).not.toBeNull();
    expect(result[0].values.posX).toBeCloseTo(0.4215);
    expect(result[0].values.posY).toBeCloseTo(0.338);
  });

  it("hostname vacío → error", () => {
    const result = validateComputerCsvRows([{ ...base, hostname: "  " }], known, {
      createMissing: false,
    });
    expect(result[0].errors).toContain("hostname obligatorio");
    expect(result[0].values).toBeNull();
  });

  it("despacho de otra planta → error", () => {
    const result = validateComputerCsvRows(
      [{ ...base, planta_nombre: "Segunda", despacho_codigo: "P1-07" }],
      known,
      { createMissing: false },
    );
    expect(result[0].errors.some((e) => /no pertenece a la planta/.test(e))).toBe(true);
  });

  it("coordenadas fuera de rango → error", () => {
    const result = validateComputerCsvRows([{ ...base, pos_x: "1.5" }], known, {
      createMissing: false,
    });
    expect(result[0].errors.some((e) => /pos_x fuera de rango/.test(e))).toBe(true);

    const result2 = validateComputerCsvRows([{ ...base, pos_y: "texto" }], known, {
      createMissing: false,
    });
    expect(result2[0].errors.some((e) => /pos_y fuera de rango/.test(e))).toBe(true);
  });

  it("celda vacía no modifica (no se incluye en values)", () => {
    const result = validateComputerCsvRows(
      [{ ...base, asignado_a: "", notas: "   ", ip: "", asset_tag: "" }],
      known,
      { createMissing: false },
    );
    expect(result[0].errors).toEqual([]);
    const values = result[0].values;
    expect(values.assignedTo).toBeUndefined();
    expect(values.notes).toBeUndefined();
    expect(values.ip).toBeUndefined();
    expect(values.assetTag).toBeUndefined();
    expect(values.hostname).toBe("PC-INT-01");
  });

  it("referencias desconocidas → error salvo createMissing", () => {
    const row = { ...base, edificio_codigo: "NUEVO", planta_nombre: "Baja", departamento_codigo: "NUEVO" };
    const strict = validateComputerCsvRows([row], known, { createMissing: false });
    expect(strict[0].errors.length).toBeGreaterThan(0);

    const lenient = validateComputerCsvRows([row], known, { createMissing: true });
    expect(lenient[0].errors).toEqual([]);
    expect(lenient[0].values.buildingCode).toBe("NUEVO");
  });

  it("normaliza headers y serializa CSV con BOM y separador ;", () => {
    const headers = ["hostname", "ip", "asignado_a"];
    const rows = normalizeCsvRows(headers, [["PC-01", "10.0.0.1", "Ana"]]);
    expect(rows[0]).toEqual({ hostname: "PC-01", ip: "10.0.0.1", asignado_a: "Ana" });

    const csv = computersToCsv(rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(lines[0].split(";")[0]).toBe("hostname");
    expect(lines[1]).toContain("PC-01");
  });
});
