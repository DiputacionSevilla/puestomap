import { ipInCidrs, normalizeAdUser, normalizeHostname } from "@puestomap/shared";

type Rec = Record<string, unknown>;

export type GlpiUser = {
  id: number;
  login: string;
  realname: string | null;
  firstname: string | null;
  phone: string | null;
  active: boolean;
};

export type GlpiLookups = {
  users: Map<number, GlpiUser>;
  manufacturers: Map<number, string>;
  models: Map<number, string>;
  states: Map<number, string>;
};

export type GlpiMapOptions = {
  allowedCidrs?: string[];
  stripDomain?: boolean;
  lastUserIgnore?: string[];
};

/** Columnas de Computer cuyo dueño es GLPI (specs/11 §3). El sync solo escribe estas. */
export type GlpiComputerUpsert = {
  glpiId: number;
  hostname: string;
  assetTag: string | null;
  serial: string | null;
  manufacturer: string | null;
  model: string | null;
  os: string | null;
  osVersion: string | null;
  cpu: string | null;
  ramMb: number | null;
  diskGb: number | null;
  ip: string | null;
  mac: string | null;
  domain: string | null;
  lastUser: string | null;
  lastUserNorm: string | null;
  adUsername: string | null;
  glpiUserName: string | null;
  glpiState: string | null;
  lastInventoryAt: Date | null;
  archived: boolean;
  /** Nº de monitores enlazados en GLPI; ausente si no se pudo consultar (no se sobrescribe). */
  monitorCount?: number;
  /** Lugar de GLPI (id); la resolución a planta/despacho la hace el sync. */
  glpiLocationId: number | null;
};

/** Cuenta los monitores enlazados (Computer_Item con itemtype Monitor y no borrados) de un equipo. */
export function countGlpiMonitors(items: Rec[]): number {
  return items.filter((item) => item.itemtype === "Monitor" && int(item.is_deleted) !== 1).length;
}

function rec(value: unknown): Rec {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

function values(value: unknown): Rec[] {
  if (Array.isArray(value)) return value.map(rec);
  return Object.values(rec(value)).map(rec);
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result.length > 0 ? result : null;
}

function int(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function positiveId(value: unknown): number | null {
  const parsed = int(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

/**
 * GLPI devuelve fechas "YYYY-MM-DD HH:MM:SS" en la zona horaria del servidor, sin indicarla.
 * Se interpretan como UTC: el error (≤ 2 h) es irrelevante para la frescura medida en días.
 */
export function parseGlpiDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(`${raw.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const VIRTUAL_PORT = /virtual|vmware|vbox|hyper-v|vethernet|vpn|pangp|tap-|tunnel|loopback|bluetooth|wan miniport|docker|wsl|tailscale|zerotier/i;

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function usableIpv4(value: string): boolean {
  return isIpv4(value) && !value.startsWith("127.") && !value.startsWith("169.254.") && !value.startsWith("0.");
}

type Candidate = { ip: string; mac: string | null; virtual: boolean; inCidr: boolean };

function networkCandidates(ports: unknown, cidrs: string[]): Candidate[] {
  const result: Candidate[] = [];
  for (const group of Object.values(rec(ports))) {
    for (const port of Array.isArray(group) ? group : []) {
      const p = rec(port);
      const virtual = VIRTUAL_PORT.test(text(p.name) ?? "");
      const mac = text(p.mac);
      for (const address of Array.isArray(rec(p.NetworkName).IPAddress) ? (rec(p.NetworkName).IPAddress as unknown[]) : []) {
        const ip = text(rec(address).name);
        if (ip && usableIpv4(ip)) {
          result.push({ ip, mac, virtual, inCidr: cidrs.length === 0 ? true : ipInCidrs(ip, cidrs) });
        }
      }
    }
  }
  const rank = (c: Candidate) => (c.virtual ? 2 : 0) + (c.inCidr ? 0 : 1);
  return result.sort((a, b) => rank(a) - rank(b));
}

function userDisplayName(user: GlpiUser | undefined): string | null {
  if (!user) return null;
  const full = [user.firstname, user.realname].filter(Boolean).join(" ").trim();
  return full || user.login;
}

function contactDomain(contact: string | null): string | null {
  if (!contact) return null;
  const at = contact.indexOf("@");
  const slash = contact.indexOf("\\");
  const domain = at >= 0 ? contact.slice(at + 1) : slash >= 0 ? contact.slice(0, slash) : "";
  return domain.trim() || null;
}

export function mapGlpiComputer(
  computer: Rec,
  lookups: GlpiLookups,
  options: GlpiMapOptions = {},
  osItems: Rec[] = [],
  monitorItems: Rec[] | null = null,
): GlpiComputerUpsert {
  const glpiId = positiveId(computer.id);
  const name = text(computer.name);
  if (glpiId === null) throw new Error("Equipo de GLPI sin id válido");
  if (!name) throw new Error(`Equipo de GLPI ${glpiId} sin nombre`);

  let hostname = normalizeHostname(name);
  if (options.stripDomain !== false && hostname.includes(".")) hostname = hostname.split(".")[0] ?? hostname;

  const devices = rec(computer._devices);
  const ramMb = values(devices.Item_DeviceMemory).reduce((sum, m) => sum + (int(m.size) ?? 0), 0);
  const diskMb = values(devices.Item_DeviceHardDrive).reduce((sum, d) => sum + (int(d.capacity) ?? 0), 0);
  const cpuItem = values(devices.Item_DeviceProcessor)[0];
  const cores = cpuItem ? int(cpuItem.nbcores) : null;
  const threads = cpuItem ? int(cpuItem.nbthreads) : null;
  const freq = cpuItem ? int(cpuItem.frequency) : null;
  const cpu = cpuItem
    ? [cores ? `${cores} núcleos` : null, threads ? `${threads} hilos` : null, freq ? `${freq} MHz` : null]
        .filter(Boolean)
        .join(" · ") || null
    : null;

  const candidates = networkCandidates(computer._networkports, options.allowedCidrs ?? []);
  const best = candidates[0];

  const contact = text(computer.contact);
  const ignore = options.lastUserIgnore ?? ["system"];
  const assignedId = positiveId(computer.users_id);
  const assigned = assignedId !== null ? lookups.users.get(assignedId) : undefined;
  const os = osItems[0];
  const manufacturerId = positiveId(computer.manufacturers_id);
  const modelId = positiveId(computer.computermodels_id);
  const stateId = positiveId(computer.states_id);

  return {
    glpiId,
    hostname,
    assetTag: text(computer.otherserial),
    serial: text(computer.serial),
    manufacturer: manufacturerId !== null ? (lookups.manufacturers.get(manufacturerId) ?? null) : null,
    model: modelId !== null ? (lookups.models.get(modelId) ?? null) : null,
    os: os ? text(os.operatingsystems_id) : null,
    osVersion: os ? text(os.operatingsystemversions_id) : null,
    cpu,
    ramMb: ramMb > 0 ? ramMb : null,
    diskGb: diskMb > 0 ? Math.round(diskMb / 1024) : null,
    ip: best?.ip ?? null,
    mac: best?.mac ?? null,
    domain: contactDomain(contact)?.toUpperCase() === hostname ? null : contactDomain(contact),
    lastUser: contact,
    lastUserNorm: normalizeAdUser(contact, ignore),
    adUsername: assigned ? normalizeAdUser(assigned.login, ignore) : null,
    glpiUserName: userDisplayName(assigned),
    glpiState: stateId !== null ? (lookups.states.get(stateId) ?? null) : null,
    lastInventoryAt: parseGlpiDate(computer.last_inventory_update),
    archived: int(computer.is_deleted) === 1,
    ...(monitorItems ? { monitorCount: countGlpiMonitors(monitorItems) } : {}),
    glpiLocationId: positiveId(computer.locations_id),
  };
}

// ---------------------------------------------------------------------------------------------
// Lugares de GLPI → Edificio / Planta / Despacho (specs/11 §5.5)
// ---------------------------------------------------------------------------------------------

export type GlpiLocation = { id: number; name: string; parent: number; level: number };

export type PlannedNode = {
  glpiId: number;
  name: string;
  kind: "building" | "floor" | "office";
  parentGlpiId: number | null;
};

export type LocationRef = {
  buildingGlpiId: number;
  /** null cuando el equipo está directamente en un lugar de nivel 1 (planta implícita). */
  floorGlpiId: number | null;
  officeGlpiId: number | null;
};

export type LocationPlan = {
  nodes: PlannedNode[];
  resolve(glpiLocationId: number | null): LocationRef | null;
  warnings: string[];
};

export function parseGlpiLocations(rows: Rec[]): GlpiLocation[] {
  return rows
    .map((row) => ({
      id: positiveId(row.id) ?? 0,
      name: text(row.name) ?? "",
      parent: positiveId(row.locations_id) ?? 0,
      level: int(row.level) ?? 1,
    }))
    .filter((l) => l.id > 0 && l.name.length > 0);
}

export function parseGlpiUsers(rows: Rec[]): GlpiUser[] {
  return rows
    .map((row) => ({
      id: positiveId(row.id) ?? 0,
      login: text(row.name) ?? "",
      realname: text(row.realname),
      firstname: text(row.firstname),
      phone: text(row.phone) ?? text(row.mobile),
      active: int(row.is_active) === 1 && int(row.is_deleted) !== 1,
    }))
    .filter((u) => u.id > 0 && u.login.length > 0);
}

/**
 * Convención por profundidad bajo la raíz: 1 = edificio, 2 = planta/zona, 3 = despacho.
 * Los lugares más profundos se asimilan al despacho de nivel 3 y generan un aviso.
 */
export function buildLocationPlan(locations: GlpiLocation[], rootId: number | null = null): LocationPlan {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const warnings: string[] = [];

  function chainOf(id: number): GlpiLocation[] | null {
    const chain: GlpiLocation[] = [];
    const seen = new Set<number>();
    let current = byId.get(id);
    while (current) {
      if (seen.has(current.id)) return null;
      seen.add(current.id);
      chain.unshift(current);
      if (rootId !== null && current.id === rootId) break;
      current = current.parent ? byId.get(current.parent) : undefined;
    }
    if (rootId !== null) {
      if (chain[0]?.id !== rootId) return null;
      return chain.slice(1);
    }
    return chain;
  }

  const nodes: PlannedNode[] = [];
  const refs = new Map<number, LocationRef>();
  for (const location of locations) {
    const chain = chainOf(location.id);
    if (!chain || chain.length === 0) continue;
    const depth = chain.length;
    const [first, second, third] = chain;
    if (!first) continue;
    if (depth === 1) {
      nodes.push({ glpiId: location.id, name: location.name, kind: "building", parentGlpiId: null });
      refs.set(location.id, { buildingGlpiId: first.id, floorGlpiId: null, officeGlpiId: null });
    } else if (depth === 2 && second) {
      nodes.push({ glpiId: location.id, name: location.name, kind: "floor", parentGlpiId: first.id });
      refs.set(location.id, { buildingGlpiId: first.id, floorGlpiId: second.id, officeGlpiId: null });
    } else if (second && third) {
      if (depth === 3) {
        nodes.push({ glpiId: location.id, name: location.name, kind: "office", parentGlpiId: second.id });
      } else {
        warnings.push(`Lugar «${location.name}» (id ${location.id}) más profundo que 3 niveles: se asimila a «${third.name}»`);
      }
      refs.set(location.id, { buildingGlpiId: first.id, floorGlpiId: second.id, officeGlpiId: third.id });
    }
  }

  return {
    nodes,
    resolve: (id) => (id === null ? null : (refs.get(id) ?? null)),
    warnings,
  };
}
