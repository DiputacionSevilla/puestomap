import { getPrisma, type PrismaClient } from "@puestomap/db";
import { normalizeAdUser, normKey, normName } from "@puestomap/shared";
import pLimit from "p-limit";
import { glpiClientFromEnv, type GlpiApi, type GlpiClient } from "../glpi/client.js";
import {
  buildLocationPlan,
  mapGlpiComputer,
  parseGlpiLocations,
  parseGlpiUsers,
  type GlpiComputerUpsert,
  type GlpiLookups,
  type GlpiUser,
  type LocationPlan,
} from "../glpi/mapper.js";
import { flushLocationWrites } from "../glpi/writeback.js";
import { buildGlpiComputerData, glpiDataChanged } from "./glpi-merge.js";

type Rec = Record<string, unknown>;

export type GlpiSyncStats = {
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  errors: number;
  locations: number;
  users: number;
  noLocation: number;
  unmappedLocation: number;
  conflicts: number;
  shadow: boolean;
  /** Solo en modo sombra: detalle para revisar antes del corte (specs/11 RF-20 CA-5). */
  report?: {
    wouldCreate: string[];
    hostnameConflicts: string[];
    unmappedLocations: string[];
    planWarnings: string[];
  };
};

export type GlpiSyncOptions = {
  prisma?: PrismaClient;
  client?: GlpiClient;
  now?: Date;
  shadow?: boolean;
  env?: Record<string, string | undefined>;
};

type Fetched = {
  plan: LocationPlan;
  users: GlpiUser[];
  computers: { mapped: GlpiComputerUpsert; template: boolean }[];
  deletedIds: Set<number>;
  allIds: Set<number>;
  failed: number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function idNameMap(rows: Rec[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of rows) {
    const id = Number(row.id);
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (Number.isInteger(id) && id > 0 && name) map.set(id, name);
  }
  return map;
}

async function fetchFromGlpi(api: GlpiApi, env: Record<string, string | undefined>): Promise<Fetched> {
  const rootId = Number(env.GLPI_LOCATION_ROOT_ID) > 0 ? Number(env.GLPI_LOCATION_ROOT_ID) : null;
  const locationRows = await api.list("Location");
  const users = parseGlpiUsers(await api.list("User"));
  const lookups: GlpiLookups = {
    users: new Map(users.map((u) => [u.id, u])),
    manufacturers: idNameMap(await api.list("Manufacturer")),
    models: idNameMap(await api.list("ComputerModel")),
    states: idNameMap(await api.list("State")),
  };
  const options = {
    allowedCidrs: (env.ALLOWED_CIDRS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    stripDomain: env.GLPI_STRIP_DOMAIN !== "false",
    lastUserIgnore: (env.LASTUSER_IGNORE ?? "system").split(",").map((s) => s.trim()),
  };

  const active = await api.list("Computer", { is_deleted: "0" });
  const trashed = await api.list("Computer", { is_deleted: "1" });
  const limit = pLimit(4);
  const computers: Fetched["computers"] = [];
  let failed = 0;

  await Promise.all(active.map((row) => limit(async () => {
    try {
      const id = Number(row.id);
      const detail = await api.get<Rec>(`Computer/${id}?with_networkports=true&with_devices=true`);
      const os = await api.get<Rec[]>(`Computer/${id}/Item_OperatingSystem?expand_dropdowns=true`);
      // Monitores enlazados (alimenta la detección de equipos multipantalla). Si falla no se pisa el valor guardado.
      let monitors: Rec[] | null = null;
      try {
        const linked = await api.get<Rec[]>(`Computer/${id}/Computer_Item`);
        monitors = Array.isArray(linked.data) ? linked.data : null;
      } catch (error) {
        console.warn(JSON.stringify({ level: "warn", event: "glpi.monitors.unavailable", glpiId: id, error: errorMessage(error) }));
      }
      const mapped = mapGlpiComputer(detail.data, lookups, options, Array.isArray(os.data) ? os.data : [], monitors);
      computers.push({ mapped, template: Number(row.is_template) === 1 });
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ level: "error", event: "glpi.computer.failed", glpiId: row.id, error: errorMessage(error) }));
    }
  })));

  const deletedIds = new Set<number>();
  for (const row of trashed) {
    const id = Number(row.id);
    if (Number.isInteger(id)) deletedIds.add(id);
  }
  const allIds = new Set<number>([...deletedIds, ...active.map((r) => Number(r.id)).filter(Number.isInteger)]);

  return {
    plan: buildLocationPlan(parseGlpiLocations(locationRows), rootId),
    users,
    computers: computers.filter((c) => !c.template),
    deletedIds,
    allIds,
    failed,
  };
}

type StructureIds = {
  buildingId: Map<number, string>;
  floorId: Map<number, string>;
  officeId: Map<number, string>;
  implicitFloorOfBuilding: Map<number, string>;
};

async function syncStructure(prisma: PrismaClient, plan: LocationPlan, needImplicitFloorFor: Set<number>): Promise<StructureIds> {
  const ids: StructureIds = { buildingId: new Map(), floorId: new Map(), officeId: new Map(), implicitFloorOfBuilding: new Map() };

  for (const node of plan.nodes.filter((n) => n.kind === "building")) {
    let building = await prisma.building.findUnique({ where: { glpiLocationId: node.glpiId } });
    if (!building) {
      const baseCode = normKey(node.name).toUpperCase() || `LUGAR-${node.glpiId}`;
      const taken = await prisma.building.findUnique({ where: { code: baseCode } });
      if (taken && !taken.glpiLocationId) {
        building = await prisma.building.update({ where: { id: taken.id }, data: { glpiLocationId: node.glpiId, name: node.name } });
      } else {
        building = await prisma.building.create({
          data: { code: taken ? `${baseCode}-${node.glpiId}` : baseCode, name: node.name, glpiLocationId: node.glpiId },
        });
      }
    } else if (building.name !== node.name) {
      building = await prisma.building.update({ where: { id: building.id }, data: { name: node.name } });
    }
    ids.buildingId.set(node.glpiId, building.id);
  }

  for (const node of plan.nodes.filter((n) => n.kind === "floor")) {
    const buildingId = node.parentGlpiId !== null ? ids.buildingId.get(node.parentGlpiId) : undefined;
    if (!buildingId) continue;
    let floor = await prisma.floor.findUnique({ where: { glpiLocationId: node.glpiId } });
    if (!floor) {
      const siblings = await prisma.floor.findMany({ where: { buildingId } });
      const same = siblings.find((f) => normKey(f.name) === normKey(node.name) && !f.glpiLocationId);
      floor = same
        ? await prisma.floor.update({ where: { id: same.id }, data: { glpiLocationId: node.glpiId } })
        : await prisma.floor.create({ data: { buildingId, name: node.name, level: siblings.length, glpiLocationId: node.glpiId } });
    } else if (floor.name !== node.name) {
      floor = await prisma.floor.update({ where: { id: floor.id }, data: { name: node.name } });
    }
    ids.floorId.set(node.glpiId, floor.id);
  }

  // Equipos situados directamente en un lugar de nivel 1: planta implícita «Planta única».
  for (const buildingGlpiId of needImplicitFloorFor) {
    const buildingId = ids.buildingId.get(buildingGlpiId);
    if (!buildingId) continue;
    const name = "Planta única";
    const existing = await prisma.floor.findUnique({ where: { buildingId_name: { buildingId, name } } });
    const floor = existing ?? await prisma.floor.create({ data: { buildingId, name, level: 0 } });
    ids.implicitFloorOfBuilding.set(buildingGlpiId, floor.id);
  }

  for (const node of plan.nodes.filter((n) => n.kind === "office")) {
    const floorId = node.parentGlpiId !== null ? ids.floorId.get(node.parentGlpiId) : undefined;
    if (!floorId) continue;
    let office = await prisma.office.findUnique({ where: { glpiLocationId: node.glpiId } });
    if (!office) {
      const baseCode = normKey(node.name).toUpperCase() || `LUGAR-${node.glpiId}`;
      const taken = await prisma.office.findUnique({ where: { floorId_code: { floorId, code: baseCode } } });
      office = taken && !taken.glpiLocationId
        ? await prisma.office.update({ where: { id: taken.id }, data: { glpiLocationId: node.glpiId, name: node.name } })
        : await prisma.office.create({
            data: { floorId, code: taken ? `${baseCode}-${node.glpiId}` : baseCode, name: node.name, glpiLocationId: node.glpiId },
          });
    } else if (office.name !== node.name) {
      office = await prisma.office.update({ where: { id: office.id }, data: { name: node.name } });
    }
    ids.officeId.set(node.glpiId, office.id);
  }
  return ids;
}

async function syncDirectory(prisma: PrismaClient, users: GlpiUser[]): Promise<number> {
  let count = 0;
  for (const user of users) {
    const username = normalizeAdUser(user.login, []);
    if (!username) continue;
    const displayName = [user.firstname, user.realname].filter(Boolean).join(" ").trim() || user.login;
    const data = {
      displayName,
      givenName: user.firstname,
      surname: user.realname,
      phone: user.phone,
      searchName: normName(displayName),
      active: user.active,
      source: "GLPI",
      glpiUserId: user.id,
    };
    try {
      await prisma.directoryUser.upsert({ where: { username }, update: data, create: { username, ...data } });
      count += 1;
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "glpi.user.failed", glpiUserId: user.id, error: errorMessage(error) }));
    }
  }
  return count;
}

export async function runGlpiSync(options: GlpiSyncOptions = {}): Promise<GlpiSyncStats> {
  const env = options.env ?? process.env;
  const prisma = options.prisma ?? getPrisma();
  const now = options.now ?? new Date();
  const shadow = options.shadow ?? env.GLPI_SHADOW === "true";
  const stats: GlpiSyncStats = {
    created: 0, updated: 0, unchanged: 0, archived: 0, errors: 0,
    locations: 0, users: 0, noLocation: 0, unmappedLocation: 0, conflicts: 0, shadow,
  };
  const run = await prisma.syncRun.create({ data: { type: "GLPI" } });

  try {
    const client = options.client ?? glpiClientFromEnv(env);
    // 0) RF-25: primero se envían los lugares pendientes (así el sync no los pisa).
    if (!shadow && env.GLPI_WRITEBACK_LOCATION === "true") {
      try {
        await flushLocationWrites(prisma, client);
      } catch (error) {
        console.error(JSON.stringify({ level: "error", event: "glpi.writeback.session_failed", error: errorMessage(error) }));
      }
    }
    // 1) Todo se lee de GLPI ANTES de escribir nada: si GLPI falla, no se archiva ni se cambia nada.
    const fetched = await client.withSession((api) => fetchFromGlpi(api, env));
    stats.errors += fetched.failed;
    stats.locations = fetched.plan.nodes.length;
    const report: NonNullable<GlpiSyncStats["report"]> = {
      wouldCreate: [], hostnameConflicts: [], unmappedLocations: [], planWarnings: fetched.plan.warnings,
    };

    const needImplicit = new Set<number>();
    for (const { mapped } of fetched.computers) {
      const ref = fetched.plan.resolve(mapped.glpiLocationId);
      if (ref && ref.floorGlpiId === null) needImplicit.add(ref.buildingGlpiId);
    }

    const structure: StructureIds = shadow
      ? { buildingId: new Map(), floorId: new Map(), officeId: new Map(), implicitFloorOfBuilding: new Map() }
      : await syncStructure(prisma, fetched.plan, needImplicit);
    if (!shadow) stats.users = await syncDirectory(prisma, fetched.users);

    const seenHostnames = new Map<string, number>();
    for (const { mapped } of fetched.computers) {
      try {
        const clash = seenHostnames.get(mapped.hostname);
        seenHostnames.set(mapped.hostname, mapped.glpiId);
        if (clash !== undefined && clash !== mapped.glpiId) {
          stats.conflicts += 1;
          stats.errors += 1;
          report.hostnameConflicts.push(`${mapped.hostname} (GLPI ${clash} y ${mapped.glpiId})`);
          continue;
        }

        const byGlpi = await prisma.computer.findUnique({ where: { glpiId: mapped.glpiId } });
        const byName = byGlpi ?? await prisma.computer.findUnique({ where: { hostname: mapped.hostname } });
        if (byName && byName.glpiId !== null && byName.glpiId !== mapped.glpiId) {
          stats.conflicts += 1;
          stats.errors += 1;
          report.hostnameConflicts.push(`${mapped.hostname} ya enlazado con GLPI ${byName.glpiId}`);
          continue;
        }

        const ref = fetched.plan.resolve(mapped.glpiLocationId);
        let location = null as { floorId: string | null; officeId: string | null } | null;
        if (mapped.glpiLocationId === null) {
          stats.noLocation += 1;
        } else if (!ref) {
          stats.unmappedLocation += 1;
          report.unmappedLocations.push(mapped.hostname);
        } else if (!shadow) {
          location = {
            floorId: (ref.floorGlpiId !== null ? structure.floorId.get(ref.floorGlpiId) : structure.implicitFloorOfBuilding.get(ref.buildingGlpiId)) ?? null,
            officeId: ref.officeGlpiId !== null ? (structure.officeId.get(ref.officeGlpiId) ?? null) : null,
          };
        }

        // Si hay un lugar pendiente de enviar a GLPI, la ubicación local manda hasta que se envíe.
        const pendingWrite = (byName as { glpiLocationTarget?: number | null } | null)?.glpiLocationTarget != null;
        const data = buildGlpiComputerData(byName as Record<string, unknown> | null, mapped, pendingWrite ? null : location, now);
        if (!byName) {
          if (shadow) report.wouldCreate.push(mapped.hostname);
          else await prisma.computer.create({ data: data as never });
          stats.created += 1;
        } else if (glpiDataChanged(byName as unknown as Record<string, unknown>, data)) {
          if (!shadow) await prisma.computer.update({ where: { id: byName.id }, data: data as never });
          stats.updated += 1;
        } else {
          stats.unchanged += 1;
        }
      } catch (error) {
        stats.errors += 1;
        console.error(JSON.stringify({ level: "error", event: "glpi.computer.sync_failed", hostname: mapped.hostname, error: errorMessage(error) }));
      }
    }

    // Equipos que ya no existen en GLPI (ni en papelera): se archivan, nunca se borran (DM-6).
    if (!shadow && fetched.failed === 0) {
      const gone = await prisma.computer.findMany({
        where: { glpiId: { not: null }, archived: false },
        select: { id: true, glpiId: true },
      });
      for (const computer of gone) {
        if (computer.glpiId !== null && (fetched.deletedIds.has(computer.glpiId) || !fetched.allIds.has(computer.glpiId))) {
          await prisma.computer.update({ where: { id: computer.id }, data: { archived: true } });
          stats.archived += 1;
        }
      }
    }

    if (shadow) stats.report = report;
    const status = stats.errors > 0 ? "PARTIAL" : "OK";
    await prisma.$transaction([
      prisma.syncRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), stats: stats as never } }),
      ...(status === "OK" && !shadow
        ? [prisma.setting.upsert({
            where: { key: "glpi.lastSyncAt" },
            update: { value: now.toISOString() },
            create: { key: "glpi.lastSyncAt", value: now.toISOString() },
          })]
        : []),
    ]);
    return stats;
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "ERROR", finishedAt: new Date(), stats: stats as never, error: errorMessage(error) },
    });
    throw error;
  }
}
