import type { ComputerUpsert } from "../ocs/mapper.js";

export type ExistingOcsComputer = {
  lastVncOkAt: Date | null;
  vncInstalled?: "YES" | "NO" | "UNKNOWN";
  vncInstalledSrc?: string | null;
};

export function mergeOcsComputer(
  existing: ExistingOcsComputer | null,
  mapped: ComputerUpsert,
  now: Date = new Date(),
): ComputerUpsert {
  const recentProbe = existing?.lastVncOkAt !== null && existing?.lastVncOkAt !== undefined &&
    now.getTime() - existing.lastVncOkAt.getTime() <= 30 * 24 * 60 * 60 * 1000;
  if (recentProbe) return { ...mapped, vncInstalled: "YES", vncInstalledSrc: "PROBE" };

  const inventoryRecent = mapped.ocsLastInventory !== null &&
    now.getTime() - mapped.ocsLastInventory.getTime() <= 30 * 24 * 60 * 60 * 1000;
  if (inventoryRecent && mapped.vncInstalled === "YES") return mapped;
  if (inventoryRecent && existing?.vncInstalled === "NO" && existing.vncInstalledSrc === "OCS") {
    return { ...mapped, vncInstalled: "NO", vncInstalledSrc: "OCS" };
  }
  return { ...mapped, vncInstalled: "UNKNOWN", vncInstalledSrc: null };
}

export function ocsDataChanged(current: Record<string, unknown>, next: ComputerUpsert): boolean {
  return Object.entries(next).some(([key, value]) => {
    const oldValue = current[key];
    if (oldValue instanceof Date && value instanceof Date) return oldValue.getTime() !== value.getTime();
    return oldValue !== value;
  });
}
