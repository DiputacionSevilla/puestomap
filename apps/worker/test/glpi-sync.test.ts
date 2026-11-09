import { readFileSync } from "node:fs";
import type { PrismaClient } from "@puestomap/db";
import { describe, expect, it } from "vitest";
import type { GlpiApi, GlpiClient } from "../src/glpi/client.js";
import { runGlpiSync } from "../src/sync/glpi.js";

type Row = Record<string, unknown>;
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

// ---------------------------------------------------------------- BD en memoria (solo lo que usa el sync)
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const v = value as Row;
      if ("not" in v) return row[key] !== v.not;
      return matches(row, v); // clave compuesta: {a_b: {a, b}}
    }
    return row[key] === value;
  });
}

function table(name: string, defaults: () => Row = () => ({})) {
  const rows: Row[] = [];
  let seq = 0;
  return {
    rows,
    findUnique: async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null,
    findMany: async ({ where }: { where?: Row } = {}) => rows.filter((r) => !where || matches(r, where)),
    create: async ({ data }: { data: Row }) => {
      const row = { id: `${name}-${(seq += 1)}`, ...defaults(), ...data };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error("no existe");
      Object.assign(row, data);
      return row;
    },
    upsert: async ({ where, update, create }: { where: Row; update: Row; create: Row }) => {
      const row = rows.find((r) => matches(r, where));
      if (row) return Object.assign(row, update);
      const created = { id: `${name}-${(seq += 1)}`, ...create };
      rows.push(created);
      return created;
    },
  };
}

function fakePrisma() {
  const db = {
    syncRun: table("run"),
    setting: table("set"),
    building: table("b"),
    floor: table("f"),
    office: table("o"),
    directoryUser: table("u"),
    computer: table("c", () => ({ archived: false, glpiId: null, floorId: null, officeId: null, posX: null, posY: null, notes: null })),
  };
  const prisma = { ...db, $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops) } as unknown as PrismaClient;
  return { prisma, db };
}

// ---------------------------------------------------------------- GLPI falso
const base = fixture("glpi-computer.sample.json") as Row;
const os = fixture("glpi-os.sample.json") as Row[];

function detail(id: number, name: string, locationId: number, extra: Row = {}): Row {
  return { ...structuredClone(base), id, name, serial: `SN-${id}`, locations_id: locationId, users_id: 305, ...extra };
}

function glpi(computers: Row[], trashed: Row[] = []): GlpiClient {
  const api: GlpiApi = {
    async list(itemtype, params) {
      if (itemtype === "Location") return fixture("glpi-locations.sample.json");
      if (itemtype === "User") return fixture("glpi-users.sample.json");
      if (itemtype === "Computer") return (params?.is_deleted === "1" ? trashed : computers).map((c) => ({ id: c.id, is_template: 0 }));
      if (itemtype === "Manufacturer") return [{ id: 9, name: "ACER" }];
      if (itemtype === "ComputerModel") return [{ id: 1, name: "Veriton" }];
      return [{ id: 6, name: "Producción" }];
    },
    async get<T>(path: string) {
      const match = /^Computer\/(\d+)(\/Item_OperatingSystem)?/.exec(path);
      const id = Number(match?.[1]);
      const data = match?.[2] ? os : (computers.find((c) => c.id === id) ?? trashed.find((c) => c.id === id));
      return { data: data as T, headers: new Headers(), status: 200 };
    },
    async put() {
      throw new Error("el sync nunca debe escribir en GLPI");
    },
  };
  return { withSession: (fn) => fn(api) };
}

const env = { ALLOWED_CIDRS: "10.0.0.0/8", GLPI_SHADOW: "false" };
const now = new Date("2026-11-09T12:00:00Z");

describe("runGlpiSync (T-I7)", () => {
  it("crea estructura, directorio y equipos, y deja 0 cambios en el segundo ciclo", async () => {
    const { prisma, db } = fakePrisma();
    const client = glpi([detail(1, "PC-A", 22), detail(2, "PC-B", 1), detail(3, "PC-C", 0)]);

    const first = await runGlpiSync({ prisma, client, now, env });
    expect(first).toMatchObject({ created: 3, updated: 0, errors: 0, noLocation: 1, shadow: false });
    expect(db.computer.rows).toHaveLength(3);
    expect(db.building.rows.find((b) => b.glpiLocationId === 1)).toMatchObject({ code: "AYUNTAMIENTO" });
    expect(db.directoryUser.rows.some((u) => u.username === "usuario1" && u.source === "GLPI")).toBe(true);

    const a = db.computer.rows.find((c) => c.hostname === "PC-A")!;
    const b = db.computer.rows.find((c) => c.hostname === "PC-B")!;
    const c = db.computer.rows.find((c) => c.hostname === "PC-C")!;
    expect(a.floorId).toBe(db.floor.rows.find((f) => f.glpiLocationId === 22)?.id);
    expect(db.floor.rows.find((f) => f.id === b.floorId)?.name).toBe("Planta única");
    expect(c.floorId).toBeNull();
    expect(a).toMatchObject({ source: "GLPI", glpiId: 1, ip: "10.158.99.10", adUsername: "usuario1" });
    expect(db.setting.rows.find((s) => s.key === "glpi.lastSyncAt")).toBeTruthy();

    const second = await runGlpiSync({ prisma, client, now: new Date("2026-11-09T12:30:00Z"), env });
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 3, archived: 0, errors: 0 });
  });

  it("no toca notas ni VNC y adopta un equipo existente por hostname", async () => {
    const { prisma, db } = fakePrisma();
    await db.computer.create({ data: { hostname: "PC-A", source: "MANUAL", notes: "nota técnica", vncPort: 5901 } });
    await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 22)]), now, env });
    const a = db.computer.rows[0]!;
    expect(a).toMatchObject({ glpiId: 1, source: "GLPI", notes: "nota técnica", vncPort: 5901 });
    expect(db.computer.rows).toHaveLength(1);
  });

  it("conserva la posición con la misma planta y la reinicia si GLPI lo cambia de planta", async () => {
    const { prisma, db } = fakePrisma();
    await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 22)]), now, env });
    const a = db.computer.rows[0]!;
    a.posX = 0.3;
    a.posY = 0.6;
    await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 22)]), now, env });
    expect(a.posX).toBe(0.3);
    await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 9)]), now, env });
    expect(a.posX).toBeNull();
    expect(a.floorId).toBe(db.floor.rows.find((f) => f.glpiLocationId === 9)?.id);
  });

  it("si GLPI no informa lugar, conserva la ubicación local", async () => {
    const { prisma, db } = fakePrisma();
    await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 22)]), now, env });
    const floorId = db.computer.rows[0]!.floorId;
    await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 0)]), now, env });
    expect(db.computer.rows[0]!.floorId).toBe(floorId);
  });

  it("archiva los equipos en papelera o desaparecidos, y los desarchiva si vuelven", async () => {
    const { prisma, db } = fakePrisma();
    await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 22), detail(2, "PC-B", 22), detail(3, "PC-C", 22)]), now, env });
    const stats = await runGlpiSync({
      prisma,
      client: glpi([detail(1, "PC-A", 22)], [detail(2, "PC-B", 22)]),
      now,
      env,
    });
    expect(stats.archived).toBe(2); // 2 en papelera, 3 desaparecido
    expect(db.computer.rows.filter((c) => c.archived).map((c) => c.hostname).sort()).toEqual(["PC-B", "PC-C"]);
    await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 22), detail(2, "PC-B", 22), detail(3, "PC-C", 22)]), now, env });
    expect(db.computer.rows.filter((c) => c.archived)).toHaveLength(0);
  });

  it("GLPI caído: SyncRun en ERROR y no se archiva ni se cambia nada", async () => {
    const { prisma, db } = fakePrisma();
    await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 22)]), now, env });
    const before = JSON.stringify(db.computer.rows);
    const down: GlpiClient = { withSession: async () => { throw new Error("GLPI devolvió text/html: revisar DNS/proxy"); } };
    await expect(runGlpiSync({ prisma, client: down, now, env })).rejects.toThrow(/DNS/);
    expect(JSON.stringify(db.computer.rows)).toBe(before);
    expect(db.syncRun.rows.at(-1)).toMatchObject({ status: "ERROR" });
  });

  it("hostnames duplicados en GLPI: el segundo se informa como conflicto y no pisa al primero", async () => {
    const { prisma, db } = fakePrisma();
    const stats = await runGlpiSync({ prisma, client: glpi([detail(1, "DUP", 22), detail(2, "dup", 22)]), now, env });
    expect(stats.conflicts).toBe(1);
    expect(db.computer.rows).toHaveLength(1);
    expect(stats.created).toBe(1);
    expect(db.syncRun.rows.at(-1)).toMatchObject({ status: "PARTIAL" });
  });

  it("modo sombra: no escribe nada y devuelve el informe", async () => {
    const { prisma, db } = fakePrisma();
    const stats = await runGlpiSync({ prisma, client: glpi([detail(1, "PC-A", 22), detail(2, "PC-B", 0)]), now, env, shadow: true });
    expect(db.computer.rows).toHaveLength(0);
    expect(db.building.rows).toHaveLength(0);
    expect(db.setting.rows).toHaveLength(0);
    expect(stats.shadow).toBe(true);
    expect(stats.report?.wouldCreate.sort()).toEqual(["PC-A", "PC-B"]);
  });

  it("el cliente falso lanza si el sync intentara escribir en GLPI", async () => {
    const client = glpi([]);
    await expect(client.withSession((api) => api.put("Computer/1", {}))).rejects.toThrow(/nunca debe escribir/);
  });
});
