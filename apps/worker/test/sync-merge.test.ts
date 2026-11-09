import { describe, expect, it } from "vitest";
import { mapOcsComputer } from "../src/ocs/mapper.js";
import { mergeOcsComputer } from "../src/sync/merge.js";

describe("mergeOcsComputer (T-U9)", () => {
  it("solo produce campos OCS y no sobrescribe gestión ni ubicación", () => {
    const mapped = mapOcsComputer({ hardware: { ID: 1, NAME: "PC-01" }, softwares: [] });
    const update = mergeOcsComputer({ lastVncOkAt: null }, mapped);
    expect(update).not.toHaveProperty("assignedTo");
    expect(update).not.toHaveProperty("notes");
    expect(update).not.toHaveProperty("floorId");
    expect(update).not.toHaveProperty("officeId");
    expect(update).not.toHaveProperty("departmentId");
    expect(update).not.toHaveProperty("adUsername");
  });

  it("conserva la evidencia de un sondeo VNC reciente", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const mapped = mapOcsComputer({ hardware: { ID: 1, NAME: "PC-01" }, softwares: [] });
    const update = mergeOcsComputer({ lastVncOkAt: new Date("2026-11-08T12:00:00Z") }, mapped, now);
    expect(update.vncInstalled).toBe("YES");
    expect(update.vncInstalledSrc).toBe("PROBE");
  });

  it("no deduce NO solo por faltar TightVNC en OCS", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const mapped = mapOcsComputer({
      hardware: { ID: 1, NAME: "PC-01", LASTDATE: "2026-11-08T12:00:00Z" },
      softwares: [],
    });
    const update = mergeOcsComputer(null, mapped, now);
    expect(update.vncInstalled).toBe("UNKNOWN");
    expect(update.vncInstalledSrc).toBeNull();
  });
});
