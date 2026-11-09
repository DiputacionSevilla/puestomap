import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLocationPlan,
  mapGlpiComputer,
  parseGlpiLocations,
  parseGlpiUsers,
  type GlpiLookups,
} from "../src/glpi/mapper.js";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const computer = fixture("glpi-computer.sample.json") as Record<string, unknown>;
const osItems = fixture("glpi-os.sample.json") as Record<string, unknown>[];
const users = parseGlpiUsers(fixture("glpi-users.sample.json"));
const lookups: GlpiLookups = {
  users: new Map(users.map((u) => [u.id, u])),
  manufacturers: new Map([[9, "ACER"]]),
  models: new Map([[1, "Veriton X2640G"]]),
  states: new Map([[6, "Producción"]]),
};

describe("mapGlpiComputer (T-U20)", () => {
  const mapped = mapGlpiComputer(computer, lookups, { allowedCidrs: ["10.0.0.0/8"] }, osItems);

  it("identidad y catálogo", () => {
    expect(mapped.glpiId).toBe(computer.id);
    expect(mapped.hostname).toBe("PC-EJEMPLO-01");
    expect(mapped.serial).toBe("SN-EJEMPLO-0001");
    expect(mapped.assetTag).toBe("MA99001");
    expect(mapped.manufacturer).toBe("ACER");
    expect(mapped.model).toBe("Veriton X2640G");
    expect(mapped.glpiState).toBe("Producción");
  });

  it("elige la IP/MAC de la interfaz física dentro de ALLOWED_CIDRS y descarta virtuales", () => {
    expect(mapped.ip).toBe("10.158.99.10");
    expect(mapped.mac).toBe("02:00:00:00:00:01");
  });

  it("si solo hay interfaz virtual, la usa antes que nada", () => {
    const onlyVirtual = structuredClone(computer) as Record<string, unknown>;
    const ports = onlyVirtual._networkports as Record<string, Record<string, unknown>[]>;
    ports.NetworkPortEthernet = [ports.NetworkPortEthernet![1]!];
    expect(mapGlpiComputer(onlyVirtual, lookups, {}).ip).toBe("172.16.10.2");
  });

  it("hardware desde los dispositivos", () => {
    expect(mapped.ramMb).toBe(8192);
    expect(mapped.diskGb).toBe(250);
    expect(mapped.cpu).toContain("4 núcleos");
    expect(mapped.cpu).toContain("3400 MHz");
    expect(mapped.os).toBe("Windows");
    expect(mapped.osVersion).toBe("2009");
  });

  it("usuarios: asignado (users_id) y último inventariado (contact)", () => {
    expect(mapped.adUsername).toBe("usuario1");
    expect(mapped.glpiUserName).toBe("Ana Ejemplo Uno");
    expect(mapped.lastUser).toBe("usuario1@MAIRENADELALCOR");
    expect(mapped.lastUserNorm).toBe("usuario1");
    expect(mapped.domain).toBe("MAIRENADELALCOR");
  });

  it("lugar, fecha de inventario y papelera", () => {
    expect(mapped.glpiLocationId).toBe(22);
    expect(mapped.lastInventoryAt).toBeNull();
    expect(mapped.archived).toBe(false);
    const dated = mapGlpiComputer({ ...computer, last_inventory_update: "2026-11-09 18:15:19", is_deleted: 1 }, lookups, {});
    expect(dated.lastInventoryAt?.toISOString()).toBe("2026-11-09T18:15:19.000Z");
    expect(dated.archived).toBe(true);
  });

  it("quita el dominio del nombre por defecto y lo conserva si se pide", () => {
    const fqdn = { ...computer, name: "pc01.ayto.local" };
    expect(mapGlpiComputer(fqdn, lookups, {}).hostname).toBe("PC01");
    expect(mapGlpiComputer(fqdn, lookups, { stripDomain: false }).hostname).toBe("PC01.AYTO.LOCAL");
  });

  it("tolera campos ausentes (equipo manual sin inventario)", () => {
    const bare = mapGlpiComputer({ id: 7, name: "Manual-01" }, lookups, {});
    expect(bare).toMatchObject({
      glpiId: 7, hostname: "MANUAL-01", ip: null, mac: null, ramMb: null, diskGb: null, cpu: null,
      adUsername: null, lastUser: null, lastUserNorm: null, glpiLocationId: null, archived: false,
    });
  });

  it("ignora el usuario SYSTEM y falla sin id o sin nombre", () => {
    expect(mapGlpiComputer({ id: 1, name: "X", contact: "SYSTEM" }, lookups, {}).lastUserNorm).toBeNull();
    expect(() => mapGlpiComputer({ name: "X" }, lookups, {})).toThrow();
    expect(() => mapGlpiComputer({ id: 3, name: " " }, lookups, {})).toThrow();
  });
});

describe("buildLocationPlan (T-U23) con los lugares reales", () => {
  const locations = parseGlpiLocations(fixture("glpi-locations.sample.json"));

  it("nivel 1 = edificio, nivel 2 = planta/zona, nivel 3 = despacho", () => {
    const plan = buildLocationPlan(locations);
    const kind = (id: number) => plan.nodes.find((n) => n.glpiId === id)?.kind;
    expect(kind(1)).toBe("building"); // AYUNTAMIENTO
    expect(kind(22)).toBe("floor"); // AYUNTAMIENTO > Informática
    expect(kind(25)).toBe("office"); // Polideportivo > Gimnasio
    expect(plan.nodes.find((n) => n.glpiId === 22)?.parentGlpiId).toBe(1);
    expect(plan.nodes.find((n) => n.glpiId === 25)?.parentGlpiId).toBe(9);
  });

  it("resuelve un equipo según el lugar en que esté", () => {
    const plan = buildLocationPlan(locations);
    expect(plan.resolve(22)).toEqual({ buildingGlpiId: 1, floorGlpiId: 22, officeGlpiId: null });
    expect(plan.resolve(1)).toEqual({ buildingGlpiId: 1, floorGlpiId: null, officeGlpiId: null });
    expect(plan.resolve(25)).toEqual({ buildingGlpiId: 1, floorGlpiId: 9, officeGlpiId: 25 });
    expect(plan.resolve(null)).toBeNull();
    expect(plan.resolve(99999)).toBeNull();
  });

  it("con raíz configurada, los hijos de la raíz pasan a ser edificios y lo externo se ignora", () => {
    const plan = buildLocationPlan(locations, 1);
    expect(plan.nodes.find((n) => n.glpiId === 22)?.kind).toBe("building");
    expect(plan.resolve(4)).toBeNull(); // APRODI está fuera de la raíz
    expect(plan.resolve(1)).toBeNull(); // la raíz en sí no es un lugar de equipo
  });

  it("avisa de lugares más profundos de 3 niveles y los asimila", () => {
    const deep = parseGlpiLocations([
      { id: 1, name: "A", locations_id: 0, level: 1 },
      { id: 2, name: "B", locations_id: 1, level: 2 },
      { id: 3, name: "C", locations_id: 2, level: 3 },
      { id: 4, name: "D", locations_id: 3, level: 4 },
    ]);
    const plan = buildLocationPlan(deep);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.resolve(4)).toEqual({ buildingGlpiId: 1, floorGlpiId: 2, officeGlpiId: 3 });
  });

  it("no se cuelga con ciclos en el árbol", () => {
    const loop = parseGlpiLocations([
      { id: 1, name: "A", locations_id: 2, level: 1 },
      { id: 2, name: "B", locations_id: 1, level: 2 },
    ]);
    expect(buildLocationPlan(loop).nodes).toEqual([]);
  });
});
