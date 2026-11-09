import type { GlpiComputerUpsert } from "../glpi/mapper.js";

/** Columnas de Computer propiedad de GLPI (specs/11 §3): únicas que el sync puede escribir con datos de inventario. */
export const GLPI_OWNED_KEYS = [
  "glpiId",
  "hostname",
  "assetTag",
  "serial",
  "manufacturer",
  "model",
  "os",
  "osVersion",
  "cpu",
  "ramMb",
  "diskGb",
  "ip",
  "mac",
  "domain",
  "lastUser",
  "lastUserNorm",
  "adUsername",
  "glpiUserName",
  "glpiState",
  "lastInventoryAt",
  "archived",
  "monitorCount",
] as const;

/** Columnas auxiliares que el sync también escribe (ubicación derivada del lugar de GLPI y trazas). */
export const GLPI_AUX_KEYS = ["glpiSyncedAt", "source", "floorId", "officeId", "posX", "posY"] as const;

export type ResolvedLocation = { floorId: string | null; officeId: string | null };

export type ExistingComputerForGlpi = {
  floorId?: string | null;
} & Record<string, unknown>;

/**
 * Datos a escribir en un equipo a partir de GLPI. Nunca incluye: notes, assignedTo, phoneExt,
 * vnc*, credentialId, estado del sondeo, pantallas ni sesiones.
 *
 * - Ubicación: si GLPI no informa lugar (`location` = null) NO se toca la ubicación local.
 * - DM-3: si la planta cambia, la posición en el plano deja de tener sentido y se reinicia.
 */
export function buildGlpiComputerData(
  current: ExistingComputerForGlpi | null,
  mapped: GlpiComputerUpsert,
  location: ResolvedLocation | null,
  now: Date,
): Record<string, unknown> {
  const { glpiLocationId: _ignored, ...owned } = mapped;
  void _ignored;
  const data: Record<string, unknown> = { ...owned, glpiSyncedAt: now, source: "GLPI" };
  if (location && (location.floorId || location.officeId)) {
    data.floorId = location.floorId;
    data.officeId = location.officeId;
    if (current && (current.floorId ?? null) !== location.floorId) {
      data.posX = null;
      data.posY = null;
    }
  }
  return data;
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b || (a == null && b == null);
}

/** ¿Hay algo que escribir? Ignora `glpiSyncedAt` para que dos syncs seguidos den 0 cambios (RF-20 CA-2). */
export function glpiDataChanged(current: Record<string, unknown>, next: Record<string, unknown>): boolean {
  return Object.entries(next).some(([key, value]) => key !== "glpiSyncedAt" && !same(current[key], value));
}
