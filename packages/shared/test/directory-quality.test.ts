import { describe, expect, it } from "vitest";
import { qualityChecksFor } from "@puestomap/shared";

describe("directorio y calidad CR-01", () => {
  it("calcula checks, directorio y solapes con las condiciones especificadas", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const rows = [
      { id: "a", floorId: "f", officeId: null, posX: 0.1, posY: 0.1, adUsername: "otro", lastUserNorm: "jlopez", ip: null, glpiId: 1, lastInventoryAt: null },
      { id: "b", floorId: "f", officeId: "o", posX: 0.11, posY: 0.1, adUsername: null, lastUserNorm: null, ip: "10.0.0.2", glpiId: null, lastInventoryAt: null },
      { id: "c", floorId: null, officeId: null, posX: null, posY: null, adUsername: "jlopez", lastUserNorm: "jlopez", ip: "10.0.0.3", glpiId: 3, lastInventoryAt: new Date("2026-11-08T00:00:00Z") },
      { id: "d", floorId: "f", officeId: null, posX: null, posY: null, adUsername: "jlopez", lastUserNorm: "jlopez", ip: "10.0.0.4", glpiId: 4, lastInventoryAt: new Date("2026-11-08T00:00:00Z") },
    ];
    const dir = new Set(["jlopez"]);
    expect(qualityChecksFor(rows[0]!, rows, dir, now)).toEqual(expect.arrayContaining(["usuarioDistinto", "sinIp", "sinInventario", "usuarioFueraDirectorio", "posicionSolapada"]));
    expect(qualityChecksFor(rows[1]!, rows, dir, now)).toEqual(expect.arrayContaining(["sinUsuario", "noEnGlpi", "posicionSolapada"]));
    expect(qualityChecksFor(rows[2]!, rows, dir, now)).toEqual(["sinLugar"]);
    expect(qualityChecksFor(rows[3]!, rows, dir, now)).toEqual(["sinColocar"]);
  });
});
