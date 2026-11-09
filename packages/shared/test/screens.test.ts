import { describe, expect, it } from "vitest";
import net from "node:net";
import { deriveMultiState, discoverScreens, validateScreenList } from "@puestomap/shared";
import { probeTcpPort } from "@puestomap/shared/probe";

const screen = (index: number, port: number, enabled = true) => ({
  index,
  port,
  label: `Pantalla ${index}`,
  enabled,
  source: "MANUAL",
});

describe("screens (T-U11)", () => {
  describe("deriveMultiState", () => {
    it("SINGLE sin pantallas ni indicios", () => {
      expect(deriveMultiState({ monitorCount: null, screens: [] })).toBe("SINGLE");
      expect(deriveMultiState({ monitorCount: 1, screens: [] })).toBe("SINGLE");
    });

    it("MULTI_OK con 2 o más pantallas habilitadas", () => {
      expect(
        deriveMultiState({ monitorCount: 2, screens: [screen(1, 5901), screen(2, 5902)] }),
      ).toBe("MULTI_OK");
      expect(
        deriveMultiState({
          monitorCount: null,
          screens: [screen(1, 5901), screen(2, 5902), screen(3, 5903)],
        }),
      ).toBe("MULTI_OK");
    });

    it("MULTI_PENDING con monitorCount > 1 y menos de 2 habilitadas", () => {
      expect(deriveMultiState({ monitorCount: 2, screens: [] })).toBe("MULTI_PENDING");
      expect(
        deriveMultiState({ monitorCount: 3, screens: [screen(1, 5901)] }),
      ).toBe("MULTI_PENDING");
      expect(
        deriveMultiState({
          monitorCount: 2,
          screens: [screen(1, 5901, false), screen(2, 5902, false)],
        }),
      ).toBe("MULTI_PENDING");
    });

    it("las pantallas deshabilitadas no cuentan", () => {
      expect(
        deriveMultiState({
          monitorCount: 2,
          screens: [screen(1, 5901), screen(2, 5902, false)],
        }),
      ).toBe("MULTI_PENDING");
    });
  });

  describe("validateScreenList", () => {
    it("lista válida", () => {
      const result = validateScreenList([
        { index: 1, port: 5901, label: "Izquierda", enabled: true },
        { index: 2, port: 5902, label: "Derecha", enabled: true },
      ]);
      expect(result.ok).toBe(true);
    });

    it("puerto fuera de rango", () => {
      const result = validateScreenList([{ index: 1, port: 6000, label: "X", enabled: true }]);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Puerto fuera de rango/);
    });

    it("índice y puerto duplicados", () => {
      const result = validateScreenList([
        { index: 1, port: 5901, label: "A", enabled: true },
        { index: 1, port: 5901, label: "B", enabled: true },
      ]);
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it("máximo 4 pantallas", () => {
      const result = validateScreenList([
        { index: 1, port: 5901, label: "A", enabled: true },
        { index: 2, port: 5902, label: "B", enabled: true },
        { index: 3, port: 5903, label: "C", enabled: true },
        { index: 4, port: 5904, label: "D", enabled: true },
        { index: 5, port: 5905, label: "E", enabled: true },
      ]);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Máximo 4/);
    });
  });

  it("descubre banners y solo deshabilita pantallas PROBE tras 7 días", async () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const old = new Date("2026-11-01T12:00:00Z");
    const results = new Map([
      [5901, { status: "banner" as const, version: "003.008" }],
      [5902, { status: "refused" as const }],
      [5903, { status: "refused" as const }],
      [5904, { status: "refused" as const }],
    ]);
    const updates = await discoverScreens(
      "pc.test",
      [
        { index: 2, port: 5902, label: "Derecha", source: "PROBE", enabled: true, lastOkAt: old },
        { index: 3, port: 5903, label: "Manual", source: "MANUAL", enabled: true, lastOkAt: old },
      ],
      { max: 4, timeoutMs: 10, now },
      async (_host, port) => results.get(port) ?? { status: "refused" },
    );
    expect(updates.find((screen) => screen.index === 1)?.source).toBe("PROBE");
    expect(updates.find((screen) => screen.index === 2)?.enabled).toBe(false);
    expect(updates.find((screen) => screen.index === 3)?.enabled).toBe(true);
  });

  it("T-I4: descubre dos servidores RFB y aplica la caducidad sin tocar MANUAL", async () => {
    const listen = async () => {
      const server = net.createServer((socket) => socket.write("RFB 003.008\n"));
      const port = await new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        resolve(typeof address === "object" && address ? address.port : 0);
      }));
      return { server, port };
    };
    const close = (server: net.Server) => new Promise<void>((resolve) => server.close(() => resolve()));
    const first = await listen();
    const second = await listen();
    const initial = await discoverScreens(
      "127.0.0.1",
      [],
      { max: 2, timeoutMs: 100, now: new Date("2026-11-01T00:00:00Z"), ports: [first.port, second.port] },
      probeTcpPort,
    );
    expect(initial).toHaveLength(2);
    expect(initial.every((screen) => screen.reachable)).toBe(true);

    await close(second.server);
    const later = await discoverScreens(
      "127.0.0.1",
      initial,
      { max: 2, timeoutMs: 100, now: new Date("2026-11-09T00:00:01Z") },
      probeTcpPort,
    );
    expect(later.find((screen) => screen.index === 2)?.enabled).toBe(false);
    const manual = await discoverScreens(
      "127.0.0.1",
      initial.map((screen) => screen.index === 2 ? { ...screen, source: "MANUAL" } : screen),
      { max: 2, timeoutMs: 100, now: new Date("2026-11-09T00:00:01Z") },
      probeTcpPort,
    );
    expect(manual.find((screen) => screen.index === 2)?.enabled).toBe(true);
    await close(first.server);
  });
});
