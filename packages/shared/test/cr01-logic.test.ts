import { describe, expect, it } from "vitest";
import {
  aspectChanged,
  deriveUserMatch,
  findOfficeAt,
  normKey,
  normName,
  normalizeAdUser,
  suggestDirectoryUsers,
  validateSvg,
} from "@puestomap/shared";

describe("normKey / normName (T-U12)", () => {
  it("PLANTA-BAJA equivale a Planta baja", () => {
    expect(normKey("PLANTA-BAJA")).toBe(normKey("Planta baja"));
    expect(normKey("Planta Baja")).toBe("planta-baja");
  });

  it("normName quita tildes y puntuación", () => {
    expect(normName("  M. Carmen  Navarro ")).toBe("m carmen navarro");
    expect(normName("María del Carmen")).toBe("maria del carmen");
  });
});

describe("suggestDirectoryUsers (T-U12)", () => {
  const users = [
    {
      username: "mcnavarro",
      displayName: "María del Carmen Navarro López",
      searchName: "maria del carmen navarro lopez",
    },
    {
      username: "pgarcia",
      displayName: "Patricia García",
      searchName: "patricia garcia",
    },
    {
      username: "pmartin",
      displayName: "Patricia Martín",
      searchName: "patricia martin",
    },
    {
      username: "jlopez",
      displayName: "Juan López",
      searchName: "juan lopez",
    },
  ];

  it("M. Carmen Navarro encuentra a María del Carmen Navarro con score >= 0.6", () => {
    const result = suggestDirectoryUsers("M. Carmen Navarro", users);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].username).toBe("mcnavarro");
    expect(result[0].score).toBeGreaterThanOrEqual(0.6);
  });

  it("Patricia con dos candidatas se marca ambiguo", () => {
    const result = suggestDirectoryUsers("Patricia", users);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.ambiguous)).toBe(true);
  });

  it("consulta sin coincidencias devuelve []", () => {
    expect(suggestDirectoryUsers("ZZZZ ZZZZ", users)).toEqual([]);
    expect(suggestDirectoryUsers("", users)).toEqual([]);
  });
});

describe("normalizeAdUser / deriveUserMatch (T-U13)", () => {
  it("normaliza dominio y UPN", () => {
    expect(normalizeAdUser("AYTO\\JMLopez")).toBe("jmlopez");
    expect(normalizeAdUser("JMLopez@ayto.local")).toBe("jmlopez");
    expect(normalizeAdUser("  ")).toBeNull();
    expect(normalizeAdUser("SYSTEM")).toBeNull();
    expect(normalizeAdUser(null)).toBeNull();
    expect(normalizeAdUser("otro", ["system", "otro"])).toBeNull();
  });

  it("los 4 estados de deriveUserMatch", () => {
    expect(deriveUserMatch({ adUsername: null, lastUserNorm: "jmlopez" })).toBe("UNASSIGNED");
    expect(deriveUserMatch({ adUsername: "jmlopez", lastUserNorm: null })).toBe("NO_OCS_USER");
    expect(deriveUserMatch({ adUsername: "jmlopez", lastUserNorm: "jmlopez" })).toBe("MATCH");
    expect(deriveUserMatch({ adUsername: "jmlopez", lastUserNorm: "pgarcia" })).toBe("MISMATCH");
  });
});

describe("validateSvg (T-U14)", () => {
  it("dimensiones por width/height", () => {
    const result = validateSvg('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"></svg>', 10000);
    expect(result.ok).toBe(true);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
  });

  it("dimensiones por viewBox", () => {
    const result = validateSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"></svg>', 10000);
    expect(result.ok).toBe(true);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
  });

  it("sin dimensiones → error", () => {
    const result = validateSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 10000);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/dimensiones/);
  });

  it("rechaza script, onload, foreignObject y href externo", () => {
    expect(validateSvg('<svg width="1" height="1"><script>x</script></svg>', 10000).ok).toBe(false);
    expect(validateSvg('<svg width="1" height="1" onload="x()"></svg>', 10000).ok).toBe(false);
    expect(validateSvg('<svg width="1" height="1"><foreignObject/></svg>', 10000).ok).toBe(false);
    expect(validateSvg('<svg width="1" height="1"><a href="http://evil"/></svg>', 10000).ok).toBe(false);
  });

  it("acepta href #id y data:image/png", () => {
    const result = validateSvg(
      '<svg width="1" height="1"><image href="data:image/png;base64,AA"/><use href="#r"/></svg>',
      10000,
    );
    expect(result.ok).toBe(true);
  });
});

describe("findOfficeAt / aspectChanged (T-U15)", () => {
  const offices = [
    { id: "big", rect: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    { id: "small", rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { id: "none", rect: null },
  ];

  it("punto dentro y en el borde", () => {
    expect(findOfficeAt(offices, 0.2, 0.2)).toBe("small");
    expect(findOfficeAt(offices, 0.5, 0.5)).toBe("big");
  });

  it("en solape gana el de menor área", () => {
    expect(findOfficeAt(offices, 0.15, 0.15)).toBe("small");
  });

  it("fuera devuelve null", () => {
    expect(findOfficeAt(offices, 0.9, 0.9)).toBeNull();
  });

  it("proporción igual / cambiada", () => {
    expect(aspectChanged({ w: 1000, h: 500 }, { w: 2000, h: 1000 })).toBe(false);
    expect(aspectChanged({ w: 1000, h: 500 }, { w: 1000, h: 600 })).toBe(true);
  });
});
