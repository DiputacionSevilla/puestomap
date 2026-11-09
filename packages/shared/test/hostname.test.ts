import { describe, expect, it } from "vitest";
import { normalizeHostname } from "@puestomap/shared";

describe("hostname (T-U7)", () => {
  it("normaliza espacios y minúsculas", () => {
    expect(normalizeHostname("  pc-int-01 ")).toBe("PC-INT-01");
    expect(normalizeHostname("PC-INT-01")).toBe("PC-INT-01");
    expect(normalizeHostname("\tpc 01\n")).toBe("PC 01");
  });
});
