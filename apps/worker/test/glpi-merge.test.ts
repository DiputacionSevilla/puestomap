import { describe, expect, it } from "vitest";
import type { GlpiComputerUpsert } from "../src/glpi/mapper.js";
import { buildGlpiComputerData, GLPI_AUX_KEYS, GLPI_OWNED_KEYS, glpiDataChanged } from "../src/sync/glpi-merge.js";

const mapped: GlpiComputerUpsert = {
  glpiId: 10, hostname: "PC-01", assetTag: null, serial: "S1", manufacturer: null, model: null, os: null, osVersion: null,
  cpu: null, ramMb: 8192, diskGb: 250, ip: "10.0.0.5", mac: null, domain: null, lastUser: null, lastUserNorm: null,
  adUsername: "usuario1", glpiUserName: "Ana", glpiState: null, lastInventoryAt: new Date("2026-11-09T10:00:00Z"),
  archived: false, glpiLocationId: 22,
};
const now = new Date("2026-11-09T12:00:00Z");

describe("buildGlpiComputerData (T-U21)", () => {
  it("solo escribe columnas propiedad de GLPI y auxiliares permitidas", () => {
    const data = buildGlpiComputerData(null, mapped, { floorId: "F1", officeId: null }, now);
    const allowed = new Set<string>([...GLPI_OWNED_KEYS, ...GLPI_AUX_KEYS]);
    for (const key of Object.keys(data)) expect(allowed.has(key), key).toBe(true);
    for (const forbidden of ["notes", "assignedTo", "phoneExt", "vncPort", "vncInstalled", "credentialId", "online", "departmentId"]) {
      expect(data).not.toHaveProperty(forbidden);
    }
    expect(data).not.toHaveProperty("glpiLocationId");
    expect(data.source).toBe("GLPI");
  });

  it("si GLPI no informa lugar, no toca la ubicación local", () => {
    const data = buildGlpiComputerData({ floorId: "F1" }, mapped, null, now);
    expect(data).not.toHaveProperty("floorId");
    expect(data).not.toHaveProperty("officeId");
    expect(data).not.toHaveProperty("posX");
  });

  it("conserva la posición si la planta no cambia y la reinicia si cambia (DM-3)", () => {
    const same = buildGlpiComputerData({ floorId: "F1", posX: 0.4 }, mapped, { floorId: "F1", officeId: "O1" }, now);
    expect(same).not.toHaveProperty("posX");
    expect(same.officeId).toBe("O1");
    const moved = buildGlpiComputerData({ floorId: "F1", posX: 0.4 }, mapped, { floorId: "F2", officeId: null }, now);
    expect(moved.posX).toBeNull();
    expect(moved.posY).toBeNull();
  });
});

describe("glpiDataChanged", () => {
  it("ignora glpiSyncedAt y compara fechas por valor (idempotencia)", () => {
    const data = buildGlpiComputerData(null, mapped, { floorId: "F1", officeId: null }, now);
    const current = { ...data, glpiSyncedAt: new Date("2026-01-01T00:00:00Z"), lastInventoryAt: new Date("2026-11-09T10:00:00Z") };
    expect(glpiDataChanged(current, buildGlpiComputerData(current, mapped, { floorId: "F1", officeId: null }, new Date()))).toBe(false);
    expect(glpiDataChanged({ ...current, ip: "10.0.0.9" }, data)).toBe(true);
  });
});
