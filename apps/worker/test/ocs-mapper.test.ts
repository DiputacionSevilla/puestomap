import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapOcsComputer } from "../src/ocs/mapper.js";

const fixturePath = fileURLToPath(new URL("./fixtures/ocs-computer.sample.json", import.meta.url));

describe("mapOcsComputer (T-U8)", () => {
  it("mapea el fixture y detecta TightVNC e IP de respaldo", async () => {
    const mapped = mapOcsComputer(JSON.parse(await readFile(fixturePath, "utf8")));
    expect(mapped).toMatchObject({
      ocsId: 1942,
      hostname: "PC-INTERV-01",
      ip: "10.20.30.40",
      mac: "AA:BB:CC:DD:EE:FF",
      lastUserNorm: "fjcarrion",
      ramMb: 16384,
      diskGb: 250,
      manufacturer: "Dell Inc.",
      monitorCount: 2,
      vncInstalled: "YES",
      vncVersion: "2.8.85",
    });
  });

  it("marca como no instalado un equipo sin software", () => {
    const mapped = mapOcsComputer({
      hardware: { ID: 7, NAME: "PC-07", LASTDATE: "2026-11-01T00:00:00Z" },
      softwares: [],
    });
    expect(mapped.vncInstalled).toBe("NO");
    expect(mapped.vncVersion).toBeNull();
  });
});
