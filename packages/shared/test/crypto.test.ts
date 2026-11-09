import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@puestomap/shared/crypto";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

describe("crypto (T-U1)", () => {
  it("cifra y descifra ida y vuelta", () => {
    const plain = "vnc-2024";
    const enc = encryptSecret(plain, KEY);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc, KEY)).toBe(plain);
  });

  it("el texto manipulado produce error", () => {
    const enc = encryptSecret("secreto", KEY);
    const parts = enc.split(":");
    const data = Buffer.from(parts[2], "base64");
    data[0] = data[0] ^ 0xff;
    const tampered = [parts[0], parts[1], data.toString("base64")].join(":");
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it("una clave incorrecta produce error", () => {
    const enc = encryptSecret("secreto", KEY);
    expect(() => decryptSecret(enc, OTHER_KEY)).toThrow();
  });

  it("una clave de tamaño incorrecto produce error", () => {
    expect(() => encryptSecret("x", Buffer.alloc(16).toString("base64"))).toThrow(
      /32 bytes/,
    );
  });

  it("un payload con formato inválido produce error", () => {
    expect(() => decryptSecret("solo-dos-partes", KEY)).toThrow(/inválido/);
  });
});
