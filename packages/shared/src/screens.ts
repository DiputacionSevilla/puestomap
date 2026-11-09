import type { MultiState, ScreenInput, ScreenLike } from "./types.js";

export const SCREEN_INDEX_MIN = 1;
export const SCREEN_INDEX_MAX = 4;
export const SCREEN_PORT_MIN = 5901;
export const SCREEN_PORT_MAX = 5909;
export const DESKTOP_PORT_DEFAULT = 5900;

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
