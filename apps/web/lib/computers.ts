import type { Prisma } from "@puestomap/db";
import type { ComputersListQuery, VncUiState } from "@puestomap/shared";
import { deriveUserMatch, deriveVncState, type MultiState, type ScreenLike } from "@puestomap/shared";

export const STALE_OCS_DAYS = 30;

const SORTABLE: Record<string, string> = {
  hostname: "hostname",
  ip: "ip",
  lastUser: "lastUser",
  assignedTo: "assignedTo",
  adUsername: "adUsername",
  os: "os",
  lastProbeAt: "lastProbeAt",
  updatedAt: "updatedAt",
  createdAt: "createdAt",
};

export function installedEffNo(): Prisma.ComputerWhereInput {
  return {
    OR: [
      { vncOverride: "NO" },
      { AND: [{ vncOverride: null }, { vncInstalled: "NO" }] },
    ],
  };
}

export function installedEffNotNo(): Prisma.ComputerWhereInput {
  return {
    NOT: {
      OR: [
        { vncOverride: "NO" },
        { AND: [{ vncOverride: null }, { vncInstalled: "NO" }] },
      ],
    },
  };
}

export function stateWhere(state: VncUiState): Prisma.ComputerWhereInput {
  switch (state) {
    case "READY":
      return { online: true, vncReachable: true };
    case "NOT_LISTENING":
      return {
        online: true,
        vncReachable: false,
        ...installedEffNotNo(),
      };
    case "NOT_INSTALLED":
      return installedEffNo();
    case "OFFLINE":
      return {
        online: false,
        ...installedEffNotNo(),
      };
    case "UNKNOWN":
      return {
        AND: [
          installedEffNotNo(),
          {
            OR: [
              { online: null },
              { AND: [{ online: true }, { vncReachable: null }] },
            ],
          },
        ],
      };
  }
}

export function buildComputersWhere(query: ComputersListQuery, directoryMatches: string[] = []): Prisma.ComputerWhereInput {
  const and: Prisma.ComputerWhereInput[] = [];

  and.push({ archived: query.archived === true ? undefined : false });

  if (query.q) {
    const q = query.q;
    and.push({
      OR: [
        { hostname: { contains: q, mode: "insensitive" } },
        { ip: { contains: q, mode: "insensitive" } },
        { lastUser: { contains: q, mode: "insensitive" } },
        { assignedTo: { contains: q, mode: "insensitive" } },
        { adUsername: { contains: q, mode: "insensitive" } },
        ...(directoryMatches.length ? [{ adUsername: { in: directoryMatches } }] : []),
        { serial: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (query.buildingId) {
    and.push({ floor: { buildingId: query.buildingId } });
  }
  if (query.floorId) and.push({ floorId: query.floorId });
  if (query.departmentId) and.push({ departmentId: query.departmentId });
  if (query.officeId) and.push({ officeId: query.officeId });
  if (query.os) {
    and.push({
      OR: [
        { os: { contains: query.os, mode: "insensitive" } },
        { osVersion: { contains: query.os, mode: "insensitive" } },
      ],
    });
  }
  if (query.unplaced === true) {
    and.push({
      OR: [{ floorId: null }, { posX: null }, { posY: null }],
    });
  }
  if (query.staleOcs === true) {
    const cutoff = new Date(Date.now() - STALE_OCS_DAYS * 24 * 60 * 60 * 1000);
    and.push({ ocsLastInventory: { lt: cutoff } });
  }
  if (query.state) {
    const states = query.state
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is VncUiState =>
        ["READY", "NOT_LISTENING", "NOT_INSTALLED", "OFFLINE", "UNKNOWN"].includes(s),
      );
    if (states.length > 0) {
      and.push({ OR: states.map((s) => stateWhere(s)) });
    }
  }
  return { AND: and };
}

export function buildOrderBy(query: ComputersListQuery): Prisma.ComputerOrderByWithRelationInput {
  const field = query.sort && SORTABLE[query.sort] ? SORTABLE[query.sort] : "hostname";
  const dir = query.dir === "desc" ? "desc" : "asc";
  return { [field]: dir } as Prisma.ComputerOrderByWithRelationInput;
}

export const computerListInclude = {
  floor: { select: { id: true, name: true, building: { select: { id: true, name: true, code: true } } } },
  office: { select: { id: true, code: true, name: true } },
  department: { select: { id: true, code: true, name: true } },
  screens: { select: { index: true, port: true, label: true, enabled: true, source: true } },
} satisfies Prisma.ComputerInclude;

export type ComputerListRow = Prisma.ComputerGetPayload<{
  include: typeof computerListInclude;
}>;

export function deriveMultiStateFrom(row: {
  monitorCount: number | null;
  screens: { index: number; port: number; label: string; enabled: boolean; source: string }[];
}): MultiState {
  const screens: ScreenLike[] = row.screens.map((s) => ({
    index: s.index,
    port: s.port,
    label: s.label,
    enabled: s.enabled,
    source: s.source,
  }));
  if (screens.filter((s) => s.enabled).length >= 2) return "MULTI_OK";
  if ((row.monitorCount ?? 0) > 1) return "MULTI_PENDING";
  return "SINGLE";
}

export function toListItem(row: ComputerListRow) {
  return {
    id: row.id,
    hostname: row.hostname,
    ip: row.ip,
    lastUser: row.lastUser,
    assignedTo: row.assignedTo,
    adUsername: row.adUsername,
    lastUserNorm: row.lastUserNorm,
    userMatch: deriveUserMatch(row),
    os: row.osVersion ?? row.os,
    building: row.floor?.building.name ?? null,
    buildingId: row.floor?.building.id ?? null,
    floor: row.floor?.name ?? null,
    floorId: row.floorId,
    office: row.office ? `${row.office.code} · ${row.office.name}` : null,
    department: row.department?.name ?? null,
    lastProbeAt: row.lastProbeAt,
    state: deriveVncState({
      online: row.online,
      vncReachable: row.vncReachable,
      vncInstalled: row.vncInstalled,
      vncOverride: row.vncOverride,
    }),
    multiState: deriveMultiStateFrom(row),
    monitorCount: row.monitorCount,
    screens: row.screens,
    archived: row.archived,
  };
}

export type ComputerListItem = ReturnType<typeof toListItem>;
