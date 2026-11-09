import { normalizeAdUser, normalizeHostname } from "@puestomap/shared";

type JsonRecord = Record<string, unknown>;

export type ComputerUpsert = {
  ocsId: number;
  hostname: string;
  ip: string | null;
  mac: string | null;
  domain: string | null;
  lastUser: string | null;
  lastUserNorm: string | null;
  os: string | null;
  osVersion: string | null;
  cpu: string | null;
  ramMb: number | null;
  diskGb: number | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  ocsLastInventory: Date | null;
  monitorCount: number | null;
  vncInstalled: "YES" | "NO" | "UNKNOWN";
  vncInstalledSrc: "OCS" | "PROBE" | null;
  vncVersion: string | null;
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function rows(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(record);
  const item = record(value);
  if (Object.keys(item).length === 0) return [];
  return Object.values(item).some((entry) => entry === null || typeof entry !== "object")
    ? [item]
    : Object.values(item).map(record);
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result.length > 0 ? result : null;
}

function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function unwrap(input: unknown): JsonRecord {
  const root = record(input);
  if (root.hardware || root.HARDWARE) return root;
  const values = Object.values(root);
  return values.length === 1 ? record(values[0]) : root;
}

function section(root: JsonRecord, name: string): unknown {
  return root[name] ?? root[name.toUpperCase()];
}

function field(row: JsonRecord, name: string): unknown {
  return row[name] ?? row[name.toLowerCase()];
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export function mapOcsComputer(input: unknown): ComputerUpsert {
  const root = unwrap(input);
  const hardware = rows(section(root, "hardware"))[0] ?? record(section(root, "hardware"));
  const bios = rows(section(root, "bios"))[0] ?? record(section(root, "bios"));
  const networks = rows(section(root, "networks"));
  const softwares = rows(section(root, "softwares"));
  const drives = rows(section(root, "drives"));
  const monitorsValue = section(root, "monitors");

  const ocsId = integer(field(hardware, "ID"));
  const hostname = text(field(hardware, "NAME"));
  if (ocsId === null || ocsId <= 0) throw new Error("OCS computer has no valid hardware.ID");
  if (!hostname) throw new Error(`OCS computer ${ocsId} has no hardware.NAME`);

  const hardwareIp = text(field(hardware, "IPADDR"));
  const activeNetwork = networks.find((network) => {
    const ip = text(field(network, "IPADDRESS"));
    return ip !== null && isIpv4(ip) && text(field(network, "STATUS"))?.toLowerCase() === "up";
  });
  const fallbackNetwork = activeNetwork ?? networks.find((network) => {
    const ip = text(field(network, "IPADDRESS"));
    return ip !== null && isIpv4(ip);
  });
  const ip = hardwareIp && isIpv4(hardwareIp) ? hardwareIp : text(field(fallbackNetwork ?? {}, "IPADDRESS"));
  const ipNetwork = networks.find((network) => text(field(network, "IPADDRESS")) === ip) ?? fallbackNetwork;
  const tightVnc = softwares.find((software) => /tightvnc/i.test(text(field(software, "NAME")) ?? ""));
  const diskMb = drives.reduce((total, drive) => {
    const type = text(field(drive, "TYPE"))?.toLowerCase() ?? "";
    const isFixed = type === "" || /fixed|hard|disk/.test(type);
    return isFixed ? total + (Number(field(drive, "TOTAL")) || 0) : total;
  }, 0);
  const inventory = text(field(hardware, "LASTDATE"));
  const inventoryDate = inventory ? new Date(inventory) : null;
  const lastUser = text(field(hardware, "USERID"));

  return {
    ocsId,
    hostname: normalizeHostname(hostname),
    ip,
    mac: text(field(ipNetwork ?? {}, "MACADDR")),
    domain: text(field(hardware, "WORKGROUP")) ?? text(field(hardware, "USERDOMAIN")),
    lastUser,
    lastUserNorm: normalizeAdUser(lastUser, (process.env.LASTUSER_IGNORE ?? "system").split(",").map((v) => v.trim())),
    os: text(field(hardware, "OSNAME")),
    osVersion: text(field(hardware, "OSVERSION")),
    cpu: text(field(hardware, "PROCESSORT")),
    ramMb: integer(field(hardware, "MEMORY")),
    diskGb: diskMb > 0 ? Math.round(diskMb / 1024) : null,
    manufacturer: text(field(bios, "SMANUFACTURER")),
    model: text(field(bios, "SMODEL")),
    serial: text(field(bios, "SSN")),
    ocsLastInventory: inventoryDate && !Number.isNaN(inventoryDate.getTime()) ? inventoryDate : null,
    monitorCount: monitorsValue === undefined || monitorsValue === null ? null : rows(monitorsValue).length,
    vncInstalled: tightVnc ? "YES" : "NO",
    vncInstalledSrc: "OCS",
    vncVersion: tightVnc ? text(field(tightVnc, "VERSION")) : null,
  };
}
