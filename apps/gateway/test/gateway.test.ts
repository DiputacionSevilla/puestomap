import http from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createGateway, type Gateway } from "../src/gateway.js";
import { MemorySessionStore } from "../src/session-store.js";

type Harness = {
  server: http.Server;
  gateway: Gateway;
  store: MemorySessionStore;
  rfb: net.Server;
  port: number;
  rfbPort: number;
};

const cleanups: Array<() => Promise<void>> = [];

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout esperando condición");
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function harness(overrides: Partial<Parameters<typeof createGateway>[0]> = {}): Promise<Harness> {
  const rfb = net.createServer((socket) => {
    socket.write("RFB 003.008\n");
    socket.on("data", (chunk) => socket.write(chunk));
  });
  const rfbPort = await new Promise<number>((resolve) => {
    rfb.listen(0, "127.0.0.1", () => {
      const addr = rfb.address();
      if (typeof addr === "object" && addr) resolve(addr.port);
      else resolve(0);
    });
  });

  const store = new MemorySessionStore();
  const gateway = createGateway({
    sessionStore: store,
    verifyToken: async (token) => {
      if (token !== "valid-token") throw new Error("token inválido");
      return { sid: "session-1" };
    },
    allowedCidrs: ["127.0.0.0/8"],
    connectTcp: ({ host, port, timeoutMs }) =>
      new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port });
        socket.setTimeout(timeoutMs, () => {
          socket.destroy();
          const err = new Error("timeout") as NodeJS.ErrnoException;
          err.code = "ETIMEDOUT";
          reject(err);
        });
        socket.once("connect", () => {
          socket.setTimeout(0);
          resolve(socket);
        });
        socket.once("error", reject);
      }),
    checkOrigin: (origin) => origin === "http://app.test",
    isPortAllowed: (port) => port >= 5900 && port <= 5909,
    idleTimeoutMs: 60_000,
    maxDurationMs: 60_000,
    ...overrides,
  });

  const server = http.createServer();
  server.on("upgrade", (req, socket, head) => gateway.handleUpgrade(req, socket, head));
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) resolve(addr.port);
      else resolve(0);
    });
  });

  const harnessValue: Harness = { server, gateway, store, rfb, port, rfbPort };
  cleanups.push(async () => {
    gateway.wss.clients.forEach((c) => c.terminate());
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => rfb.close(() => resolve()));
  });
  return harnessValue;
}

function connect(
  h: Harness,
  token: string,
  origin = "http://app.test",
): Promise<{ ws: WebSocket; closed: Promise<{ code: number; reason: string }> }> {
  const ws = new WebSocket(`ws://127.0.0.1:${h.port}/vnc-ws?token=${token}`, {
    origin,
    handshakeTimeout: 3000,
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve({ ws, closed }));
    ws.once("error", reject);
  });
}

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

describe("gateway (T-I2)", () => {
  it("(a) token válido recibe el banner y el eco", async () => {
    const h = await harness({ isPortAllowed: () => true });
    h.store.seed("session-1", {
      targetIp: "127.0.0.1",
      targetHostname: "pc-local",
      targetPort: h.rfbPort,
    });
    const { ws } = await connect(h, "valid-token");
    const received: Buffer[] = [];
    ws.on("message", (data) => received.push(Buffer.from(data as ArrayBuffer)));
    await waitFor(() => received.some((b) => b.toString().includes("RFB 003.008")));
    ws.send("ping-bytes");
    await waitFor(() => received.some((b) => b.toString().includes("ping-bytes")));
    ws.close();
  });

  it("(b) token inválido → cierre 4401", async () => {
    const h = await harness();
    const { closed } = await connect(h, "bad-token");
    expect((await closed).code).toBe(4401);
  });

  it("(c) el mismo token no se puede usar dos veces → 4409", async () => {
    const h = await harness({ isPortAllowed: () => true });
    h.store.seed("session-1", {
      targetIp: "127.0.0.1",
      targetHostname: "pc-local",
      targetPort: h.rfbPort,
    });
    const first = await connect(h, "valid-token");
    first.ws.close();
    await first.closed;
    const second = await connect(h, "valid-token");
    expect((await second.closed).code).toBe(4409);
  });

  it("(d) destino fuera de ALLOWED_CIDRS → 4403", async () => {
    const h = await harness();
    h.store.seed("session-1", {
      targetIp: "172.16.0.5",
      targetHostname: "pc-remota",
      targetPort: h.rfbPort,
    });
    const { closed } = await connect(h, "valid-token");
    expect((await closed).code).toBe(4403);
  });

  it("(e) Origin incorrecto → 4403", async () => {
    const h = await harness();
    h.store.seed("session-1", {
      targetIp: "127.0.0.1",
      targetHostname: "pc-local",
      targetPort: h.rfbPort,
    });
    const { closed } = await connect(h, "valid-token", "http://otro-sitio");
    expect((await closed).code).toBe(4403);
  });

  it("(f) al cerrar el cliente se registra finish con bytes > 0", async () => {
    const h = await harness({ isPortAllowed: () => true });
    h.store.seed("session-1", {
      targetIp: "127.0.0.1",
      targetHostname: "pc-local",
      targetPort: h.rfbPort,
    });
    const { ws } = await connect(h, "valid-token");
    const received: Buffer[] = [];
    ws.on("message", (data) => received.push(Buffer.from(data as ArrayBuffer)));
    await waitFor(() => received.some((b) => b.toString().includes("RFB 003.008")));
    ws.send("hola");
    await waitFor(() => received.some((b) => b.toString().includes("hola")));
    ws.close();
    await waitFor(() => h.store.finished.has("session-1"));
    const stats = h.store.finished.get("session-1");
    expect(stats?.bytesIn).toBeGreaterThan(0);
    expect(stats?.bytesOut).toBeGreaterThan(0);
    expect(stats?.endReason).toBe("client_closed");
  });

  it("(g) targetPort fuera de VNC_ALLOWED_PORTS → 4403", async () => {
    const h = await harness();
    h.store.seed("session-1", {
      targetIp: "127.0.0.1",
      targetHostname: "pc-local",
      targetPort: 7000,
    });
    const { closed } = await connect(h, "valid-token");
    expect((await closed).code).toBe(4403);
  });

  it("T-62: dns_first usa la IP resuelta y resolvedBy=dns; fallo DNS → IP de BD", async () => {
    const h = await harness({
      isPortAllowed: () => true,
      resolveHost: async (hostname) => (hostname === "pc-dns" ? "127.0.0.1" : null),
    });
    h.store.seed("session-1", {
      targetIp: "127.0.0.1",
      targetHostname: "pc-dns",
      targetPort: h.rfbPort,
    });
    const first = await connect(h, "valid-token");
    first.ws.close();
    await waitFor(() => h.store.finished.has("session-1"));
    expect(h.store.finished.get("session-1")?.resolvedBy).toBe("dns");

    const h2 = await harness({
      isPortAllowed: () => true,
      resolveHost: async () => null,
    });
    h2.store.seed("session-1", {
      targetIp: "127.0.0.1",
      targetHostname: "pc-sin-dns",
      targetPort: h2.rfbPort,
    });
    const second = await connect(h2, "valid-token");
    second.ws.close();
    await waitFor(() => h2.store.finished.has("session-1"));
    expect(h2.store.finished.get("session-1")?.resolvedBy).toBe("db");
  });
});
