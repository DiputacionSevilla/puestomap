import { describe, expect, it } from "vitest";
import { computeVncInstalled, deriveVncState } from "@puestomap/shared";

describe("vnc-status (T-U5)", () => {
  it("READY: online y vncReachable", () => {
    expect(
      deriveVncState({ online: true, vncReachable: true, vncInstalled: "UNKNOWN" }),
    ).toBe("READY");
  });

  it("NOT_LISTENING: online, sin VNC y instalado != NO", () => {
    expect(
      deriveVncState({ online: true, vncReachable: false, vncInstalled: "UNKNOWN" }),
    ).toBe("NOT_LISTENING");
    expect(
      deriveVncState({ online: true, vncReachable: false, vncInstalled: "YES" }),
    ).toBe("NOT_LISTENING");
  });

  it("NOT_INSTALLED: instalado efectivo NO (antes que OFFLINE)", () => {
    expect(
      deriveVncState({ online: true, vncReachable: false, vncInstalled: "NO" }),
    ).toBe("NOT_INSTALLED");
    expect(
      deriveVncState({ online: false, vncReachable: null, vncInstalled: "NO" }),
    ).toBe("NOT_INSTALLED");
  });

  it("OFFLINE: online false", () => {
    expect(
      deriveVncState({ online: false, vncReachable: false, vncInstalled: "YES" }),
    ).toBe("OFFLINE");
  });

  it("UNKNOWN: nunca sondeado", () => {
    expect(
      deriveVncState({ online: null, vncReachable: null, vncInstalled: "UNKNOWN" }),
    ).toBe("UNKNOWN");
    expect(
      deriveVncState({ online: true, vncReachable: null, vncInstalled: "UNKNOWN" }),
    ).toBe("UNKNOWN");
  });

  it("vncOverride manual gana sobre vncInstalled", () => {
    expect(
      deriveVncState({
        online: true,
        vncReachable: false,
        vncInstalled: "YES",
        vncOverride: "NO",
      }),
    ).toBe("NOT_INSTALLED");
    expect(
      deriveVncState({
        online: false,
        vncReachable: null,
        vncInstalled: "NO",
        vncOverride: "YES",
      }),
    ).toBe("OFFLINE");
  });

  describe("cálculo de vncInstalled", () => {
    const now = new Date("2026-06-15T12:00:00Z");

    it("regla 1: banner RFB en los últimos 30 días → YES (PROBE)", () => {
      const result = computeVncInstalled({
        lastVncOkAt: new Date("2026-06-01T12:00:00Z"),
        ocsInventoryRecent: false,
        ocsHasTightVnc: null,
        lastProbeOnline: null,
        lastProbeVncRefused: false,
        now,
      });
      expect(result).toEqual({ state: "YES", src: "PROBE" });
    });

    it("regla 1 descartada si el banner tiene más de 30 días", () => {
      const result = computeVncInstalled({
        lastVncOkAt: new Date("2026-04-01T12:00:00Z"),
        ocsInventoryRecent: true,
        ocsHasTightVnc: true,
        lastProbeOnline: null,
        lastProbeVncRefused: false,
        now,
      });
      expect(result).toEqual({ state: "YES", src: "OCS" });
    });

    it("regla 2: inventario OCS reciente con TightVNC → YES (OCS)", () => {
      const result = computeVncInstalled({
        lastVncOkAt: null,
        ocsInventoryRecent: true,
        ocsHasTightVnc: true,
        lastProbeOnline: null,
        lastProbeVncRefused: false,
        now,
      });
      expect(result).toEqual({ state: "YES", src: "OCS" });
    });

    it("regla 3: OCS reciente sin TightVNC + sondeo rechazado → NO (OCS)", () => {
      const result = computeVncInstalled({
        lastVncOkAt: null,
        ocsInventoryRecent: true,
        ocsHasTightVnc: false,
        lastProbeOnline: true,
        lastProbeVncRefused: true,
        now,
      });
      expect(result).toEqual({ state: "NO", src: "OCS" });
    });

    it("regla 4: resto → UNKNOWN", () => {
      expect(
        computeVncInstalled({
          lastVncOkAt: null,
          ocsInventoryRecent: false,
          ocsHasTightVnc: null,
          lastProbeOnline: null,
          lastProbeVncRefused: false,
          now,
        }),
      ).toEqual({ state: "UNKNOWN", src: null });

      expect(
        computeVncInstalled({
          lastVncOkAt: null,
          ocsInventoryRecent: true,
          ocsHasTightVnc: false,
          lastProbeOnline: true,
          lastProbeVncRefused: false,
          now,
        }),
      ).toEqual({ state: "UNKNOWN", src: null });
    });
  });
});
