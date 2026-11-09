import type { MultiState, ScreenInput, ScreenLike } from "./types.js";
import type { PortProbeFn } from "./probe.js";

export const SCREEN_INDEX_MIN = 1;
export const SCREEN_INDEX_MAX = 4;
export const SCREEN_PORT_MIN = 5901;
export const SCREEN_PORT_MAX = 5909;
export const DESKTOP_PORT_DEFAULT = 5900;
export const SCREEN_PROBE_DISABLE_DAYS = 7;

export function defaultScreenPort(index: number): number {
  return DESKTOP_PORT_DEFAULT + index;
}

export function deriveMultiState(input: {
  monitorCount: number | null;
  screens: ScreenLike[];
}): MultiState {
  const enabled = input.screens.filter((s) => s.enabled).length;
  if (enabled >= 2) return "MULTI_OK";
  if ((input.monitorCount ?? 0) > 1 && enabled < 2) return "MULTI_PENDING";
  return "SINGLE";
}

export function validateScreenList(screens: ScreenInput[]): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (screens.length > SCREEN_INDEX_MAX) {
    errors.push(`Máximo ${SCREEN_INDEX_MAX} pantallas`);
  }
  const seenIndex = new Set<number>();
  const seenPort = new Set<number>();
  for (const screen of screens) {
    if (
      !Number.isInteger(screen.index) ||
      screen.index < SCREEN_INDEX_MIN ||
      screen.index > SCREEN_INDEX_MAX
    ) {
      errors.push(`Índice de pantalla fuera de rango: ${screen.index}`);
    }
    if (
      !Number.isInteger(screen.port) ||
      screen.port < SCREEN_PORT_MIN ||
      screen.port > SCREEN_PORT_MAX
    ) {
      errors.push(`Puerto fuera de rango (${SCREEN_PORT_MIN}-${SCREEN_PORT_MAX}): ${screen.port}`);
    }
    if (seenIndex.has(screen.index)) {
      errors.push(`Índice duplicado: ${screen.index}`);
    }
    if (seenPort.has(screen.port)) {
      errors.push(`Puerto duplicado: ${screen.port}`);
    }
    seenIndex.add(screen.index);
    seenPort.add(screen.port);
  }
  return { ok: errors.length === 0, errors };
}

export type ScreenProbeState = {
  id?: string;
  index: number;
  port: number;
  label: string;
  source: string;
  enabled: boolean;
  lastOkAt: Date | null;
};

export type ScreenProbeUpdate = ScreenProbeState & {
  reachable: boolean;
  lastProbeAt: Date;
  lastOkAt: Date | null;
};

export async function discoverScreens(
  host: string,
  existing: ScreenProbeState[],
  options: { max: number; timeoutMs: number; now?: Date; ports?: number[] },
  probePort: PortProbeFn,
): Promise<ScreenProbeUpdate[]> {
  const now = options.now ?? new Date();
  const cutoff = now.getTime() - SCREEN_PROBE_DISABLE_DAYS * 24 * 60 * 60 * 1000;
  const byIndex = new Map(existing.map((screen) => [screen.index, screen]));
  const updates: ScreenProbeUpdate[] = [];

  for (let index = SCREEN_INDEX_MIN; index <= Math.min(options.max, SCREEN_INDEX_MAX); index += 1) {
    const current = byIndex.get(index);
    const port = current?.port ?? options.ports?.[index - 1] ?? defaultScreenPort(index);
    const result = await probePort(host, port, options.timeoutMs);
    const reachable = result.status === "banner";
    if (!current && !reachable) continue;

    const lastOkAt = reachable ? now : (current?.lastOkAt ?? null);
    const disable =
      !reachable &&
      current?.source === "PROBE" &&
      lastOkAt !== null &&
      lastOkAt.getTime() < cutoff;
    updates.push({
      id: current?.id,
      index,
      port,
      label: current?.label ?? `Pantalla ${index}`,
      source: current?.source ?? "PROBE",
      enabled: disable ? false : (current?.enabled ?? true),
      reachable,
      lastProbeAt: now,
      lastOkAt,
    });
  }
  return updates;
}
