import http from "node:http";
import net from "node:net";
import dns from "node:dns";
import pg from "pg";
import { verifyGatewayToken } from "@puestomap/shared/token";
import { createGateway } from "./gateway.js";
import { PgSessionStore } from "./pg-session-store.js";
import { logger } from "./logger.js";

function env(name: string, fallback = ""): string {
  const vars: Record<string, string | undefined> = process.env;
  return vars[name] ?? fallback;
}

function parsePorts(spec: string): number[] {
  const ports: number[] = [];
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      for (let p = Number(range[1]); p <= Number(range[2]); p++) ports.push(p);
    } else if (/^\d+$/.test(part)) {
      ports.push(Number(part));
    }
  }
  return ports;
}

function connectTcp({ host, port, timeoutMs }: { host: string; port: number; timeoutMs: number }) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const onError = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => {
      const err = new Error("timeout") as NodeJS.ErrnoException;
      err.code = "ETIMEDOUT";
      onError(err);
    });
    socket.once("connect", () => {
      socket.setTimeout(0);
      socket.removeListener("error", onError);
      resolve(socket);
    });
    socket.once("error", onError);
  });
}

async function resolveHost(hostname: string): Promise<string | null> {
  const suffix = env("DNS_SUFFIX");
  const name = suffix && !hostname.includes(".") ? `${hostname}${suffix}` : hostname;
  try {
    const result = await dns.promises.lookup(name, { family: 4 });
    return result.address;
  } catch {
    return null;
  }
}

const port = Number(env("GATEWAY_PORT", "8081"));
const allowedCidrs = env("ALLOWED_CIDRS", "10.0.0.0/8,192.168.0.0/16")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedPorts = parsePorts(env("VNC_ALLOWED_PORTS", "5900-5909"));
const appUrl = env("APP_URL", "http://localhost:3000");
const idleTimeoutMs = Number(env("SESSION_IDLE_TIMEOUT_MIN", "30")) * 60 * 1000;
const maxDurationMs = Number(env("SESSION_MAX_HOURS", "4")) * 60 * 60 * 1000;
const databaseUrl = env("DATABASE_URL");
const jwtSecret = env("GATEWAY_JWT_SECRET");

if (!jwtSecret) {
  logger.error("Falta GATEWAY_JWT_SECRET");
  process.exit(1);
}
if (!databaseUrl) {
  logger.error("Falta DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
const sessionStore = new PgSessionStore(pool);

const gateway = createGateway({
  sessionStore,
  verifyToken: (token) => verifyGatewayToken(token, jwtSecret),
  allowedCidrs,
  connectTcp,
  checkOrigin: (origin) => origin === appUrl,
  resolveHost,
  isPortAllowed: (p) => allowedPorts.includes(p),
  idleTimeoutMs,
  maxDurationMs,
  logger,
});

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";
  if (!url.startsWith("/vnc-ws")) {
    socket.destroy();
    return;
  }
  gateway.handleUpgrade(req, socket, head);
});

server.listen(port, () => {
  logger.info("Gateway escuchando", { port });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void pool.end();
    process.exit(0);
  });
}
