import { describe, expect, it } from "vitest";
import { glpiTicketId, safeCallbackPath } from "@puestomap/shared";

describe("enlace desde GLPI (T-I9)", () => {
  it("solo acepta rutas internas como callback", () => {
    expect(safeCallbackPath("/equipos/glpi/147")).toBe("/equipos/glpi/147");
    expect(safeCallbackPath("/equipos/glpi?name=PC-01")).toBe("/equipos/glpi?name=PC-01");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "/login", "", undefined, null, 5]) {
      expect(safeCallbackPath(bad)).toBe("/");
    }
  });
  it("extrae el nº de ticket de «#1234»", () => {
    expect(glpiTicketId("#1234 impresora")).toBe(1234);
    expect(glpiTicketId("incidencia 1234")).toBeNull();
    expect(glpiTicketId(null)).toBeNull();
  });
});
