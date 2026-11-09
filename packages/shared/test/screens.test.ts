import { describe, expect, it } from "vitest";
import { deriveMultiState, validateScreenList } from "@puestomap/shared";

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
});
