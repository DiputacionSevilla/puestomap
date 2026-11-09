import { afterEach, describe, expect, it, vi } from "vitest";
import { signGatewayToken, verifyGatewayToken } from "@puestomap/shared/token";

const SECRET = "secreto-de-pruebas";
const OTHER = "otro-secreto";

afterEach(() => {
  vi.useRealTimers();
});

describe("token (T-U2)", () => {
  it("firma y verifica", async () => {
    const token = await signGatewayToken({ sid: "sesion-1" }, SECRET);
    const payload = await verifyGatewayToken(token, SECRET);
    expect(payload.sid).toBe("sesion-1");
  });

  it("un token caducado produce error", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = await signGatewayToken({ sid: "sesion-1" }, SECRET, 1);
    vi.setSystemTime(new Date("2026-01-01T00:00:10Z"));
    await expect(verifyGatewayToken(token, SECRET)).rejects.toThrow();
  });

  it("una firma con otro secreto produce error", async () => {
    const token = await signGatewayToken({ sid: "sesion-1" }, OTHER);
    await expect(verifyGatewayToken(token, SECRET)).rejects.toThrow();
  });

  it("un token basura produce error", async () => {
    await expect(verifyGatewayToken("no-es-un-jwt", SECRET)).rejects.toThrow();
  });
});
