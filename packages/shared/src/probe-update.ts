import { computeVncInstalled } from "./vnc-status.js";
import type { ProbeResult } from "./probe.js";
import type { TriStateValue } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ProbeableComputer = {
  vncInstalled: TriStateValue;
  vncInstalledSrc: string | null;
  vncVersion: string | null;
  ocsLastInventory: Date | null;
  lastVncOkAt: Date | null;
  lastSeenAt: Date | null;
};

export type ProbeUpdate = {
  online: boolean | null;
  vncReachable: boolean;
  rfbVersion: string | null;
  lastProbeAt: Date;
  lastSeenAt: Date | null;
  lastVncOkAt: Date | null;
  vncInstalled: TriStateValue;
  vncInstalledSrc: string | null;
};

export function applyProbeResult(
  computer: ProbeableComputer,
  result: ProbeResult,
  now: Date = new Date(),
): ProbeUpdate {
  const lastVncOkAt =
    result.vncReachable === true ? now : computer.lastVncOkAt;

  const ocsInventoryRecent =
    computer.ocsLastInventory !== null &&
    now.getTime() - computer.ocsLastInventory.getTime() <= 30 * DAY_MS;

  const ocsHasTightVnc: boolean | null = computer.vncVersion
    ? true
    : ocsInventoryRecent
      ? false
      : null;

  const installed = computeVncInstalled({
    lastVncOkAt,
    ocsInventoryRecent,
    ocsHasTightVnc,
    lastProbeOnline: result.online,
    lastProbeVncRefused: result.error === "refused",
    now,
  });

  return {
    online: result.online,
    vncReachable: result.vncReachable,
    rfbVersion: result.rfbVersion ?? null,
    lastProbeAt: now,
    lastSeenAt: result.online === true ? now : computer.lastSeenAt,
    lastVncOkAt,
    vncInstalled: installed.state,
    vncInstalledSrc: installed.src,
  };
}
