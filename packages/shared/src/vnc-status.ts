import type {
  TriStateValue,
  VncInstalledInput,
  VncInstalledResult,
  VncUiState,
} from "./types.js";

export type VncStateInput = {
  online: boolean | null;
  vncReachable: boolean | null;
  vncInstalled: TriStateValue;
  vncOverride?: TriStateValue | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function effectiveInstalled(input: VncStateInput): TriStateValue {
  return input.vncOverride ?? input.vncInstalled;
}

export function deriveVncState(input: VncStateInput): VncUiState {
  const installed = effectiveInstalled(input);
  if (input.online === true && input.vncReachable === true) return "READY";
  if (input.online === true && input.vncReachable === false && installed !== "NO") {
    return "NOT_LISTENING";
  }
  if (installed === "NO") return "NOT_INSTALLED";
  if (input.online === false) return "OFFLINE";
  return "UNKNOWN";
}

export function computeVncInstalled(input: VncInstalledInput): VncInstalledResult {
  const now = input.now ?? new Date();

  if (input.lastVncOkAt && now.getTime() - input.lastVncOkAt.getTime() <= 30 * DAY_MS) {
    return { state: "YES", src: "PROBE" };
  }
  if (input.ocsInventoryRecent && input.ocsHasTightVnc === true) {
    return { state: "YES", src: "OCS" };
  }
  if (
    input.ocsInventoryRecent &&
    input.ocsHasTightVnc === false &&
    input.lastProbeOnline === true &&
    input.lastProbeVncRefused
  ) {
    return { state: "NO", src: "OCS" };
  }
  return { state: "UNKNOWN", src: null };
}
