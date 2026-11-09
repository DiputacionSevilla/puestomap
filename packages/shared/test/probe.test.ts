import net from "node:net";
import { describe, expect, it } from "vitest";
import {
  probeComputer,
  probeTcpPort,
  type PortProbeFn,
} from "@puestomap/shared/probe";

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        reject(new Error("sin puerto asignado"));
        return;
      }
      resolve(addr.port);
    });
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("probeComputer (T-I1)", () => {
  it("servidor que envía banner RFB → vncReachable=true", async () => {
    const server = net.createServer((socket) => {
      socket.write("RFB 003.008\n");
    });
    const port = await listen(server);
    try {
      const result = await probeComputer(
        { host: "127.0.0.1", vncPort: port },
        { timeoutMs: 1000, onlinePorts: [] },
      );
      expect(result.online).toBe(true);
      expect(result.vncReachable).toBe(true);
      expect(result.rfbVersion).toBe("003.008");
    } finally {
      await closeServer(server);
    }
  });

  it("puerto cerrado → refused y online=true (host vivo)", async () => {
    const server = net.createServer(() => {});
    const port = await listen(server);
    await closeServer(server);
    const result = await probeComputer(
      { host: "127.0.0.1", vncPort: port },
      { timeoutMs: 500, onlinePorts: [] },
    );
    expect(result.online).toBe(true);
    expect(result.vncReachable).toBe(false);
    expect(result.error).toBe("refused");
  });

  it("servidor que no responde y puertos online sin respuesta → online=false", async () => {
    const server = net.createServer(() => {
      /* acepta y nunca responde */
    });
    const port = await listen(server);
    try {
      // En loopback un puerto sin servicio responde con RST (rechazo) que cuenta como
      // host vivo (RF-09 CA-2); para simular "cerrado" (sin respuesta) se inyecta timeout.
      const withTimeoutOnOnlinePorts: PortProbeFn = async (host, target, timeoutMs) =>
        target === port ? probeTcpPort(host, target, timeoutMs) : { status: "timeout" };
      const result = await probeComputer(
        { host: "127.0.0.1", vncPort: port },
        { timeoutMs: 300, onlinePorts: [445, 135, 3389] },
        withTimeoutOnOnlinePorts,
      );
      expect(result.online).toBe(false);
      expect(result.vncReachable).toBe(false);
      expect(result.error).toBe("timeout");
    } finally {
      await closeServer(server);
    }
  });

  it("timeout en VNC pero un puerto online rechaza → online=true", async () => {
    const server = net.createServer(() => {});
    const port = await listen(server);
    const closed = net.createServer(() => {});
    const closedPort = await listen(closed);
    await closeServer(closed);
    try {
      const result = await probeComputer(
        { host: "127.0.0.1", vncPort: port },
        { timeoutMs: 300, onlinePorts: [closedPort] },
      );
      expect(result.online).toBe(true);
      expect(result.vncReachable).toBe(false);
      expect(result.error).toBe("timeout");
    } finally {
      await closeServer(server);
    }
  });

  it("banner inválido → bad_banner y online=true", async () => {
    const server = net.createServer((socket) => {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    });
    const port = await listen(server);
    try {
      const result = await probeComputer(
        { host: "127.0.0.1", vncPort: port },
        { timeoutMs: 500, onlinePorts: [] },
      );
      expect(result.online).toBe(true);
      expect(result.vncReachable).toBe(false);
      expect(result.error).toBe("bad_banner");
    } finally {
      await closeServer(server);
    }
  });
});
