import { describe, expect, it } from "vitest";
import { parseCsvTable, validatePositions } from "@puestomap/shared";

const computers = [
  { id: "c1", hostname: "PC-A", floorId: "f1" },
  { id: "c2", hostname: "PC-B", floorId: null },
];
const offices = [
  { id: "o1", code: "D1", floorId: "f1", rect: { x: 0, y: 0, w: 0.5, h: 0.5 } },
  { id: "o2", code: "D2", floorId: "f2", rect: null },
];
const run = (csv: string) => validatePositions(parseCsvTable(csv).rows, computers, offices);

describe("posiciones.csv (T-I11)", () => {
  it("coloca un equipo sincronizado y asigna despacho por posición", () => {
    const [r] = run("hostname;pos_x;pos_y\nPC-A;0.2;0,3");
    expect(r).toMatchObject({ computerId: "c1", floorId: "f1", officeId: "o1", posX: 0.2, posY: 0.3, errors: [] });
  });
  it("hostname desconocido ⇒ EQUIPO_NO_SINCRONIZADO (no se crea)", () => {
    expect(run("hostname;pos_x;pos_y\nNOPE;0.1;0.1")[0]!.errors[0]!.code).toBe("EQUIPO_NO_SINCRONIZADO");
  });
  it("sin planta ⇒ SIN_PLANTA, salvo que el despacho la determine", () => {
    expect(run("hostname;pos_x;pos_y\nPC-B;0.1;0.1")[0]!.errors.map((e) => e.code)).toContain("SIN_PLANTA");
    const [r] = run("hostname;pos_x;pos_y;despacho_codigo\nPC-B;0.1;0.1;D2");
    expect(r).toMatchObject({ floorId: "f2", officeId: "o2", errors: [] });
  });
  it("valida rango y duplicados; es idempotente", () => {
    expect(run("hostname;pos_x;pos_y\nPC-A;2;0.1")[0]!.errors[0]!.code).toBe("POSICION_INVALIDA");
    expect(run("hostname;pos_x;pos_y\nPC-A;0.1;0.1\nPC-A;0.2;0.2")[1]!.errors[0]!.code).toBe("HOSTNAME_DUPLICADO");
    const csv = "hostname;pos_x;pos_y\npc-a.ayto.local;0.2;0.3";
    expect(run(csv)).toEqual(run(csv));
    expect(run(csv)[0]!.hostname).toBe("PC-A");
  });
});
