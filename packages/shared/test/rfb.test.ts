import { describe, expect, it } from "vitest";
import { parseRfbBanner } from "@puestomap/shared";

describe("rfb (T-U4)", () => {
  it("banner RFB 003.008 correcto", () => {
    expect(parseRfbBanner(Buffer.from("RFB 003.008\n", "ascii"))).toBe("003.008");
  });

  it("banner RFB 003.003 correcto", () => {
    expect(parseRfbBanner(Buffer.from("RFB 003.003\n", "ascii"))).toBe("003.003");
  });

  it("basura devuelve null", () => {
    expect(parseRfbBanner(Buffer.from("XXXXYYYYZZZZ", "ascii"))).toBeNull();
  });

  it("longitud corta devuelve null", () => {
    expect(parseRfbBanner(Buffer.from("RFB 003.00", "ascii"))).toBeNull();
    expect(parseRfbBanner(Buffer.alloc(0))).toBeNull();
  });
});
