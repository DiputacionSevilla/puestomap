import type { Socket } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { ipInCidrs } from "@puestomap/shared";
import type { SessionStore } from "./session-store.js";

export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_FORBIDDEN = 4403;
export const CLOSE_CONFLICT = 4409;
export const CLOSE_TARGET_ERROR = 4502;

const PING_INTERVAL_MS = 25_000;
const BUFFER_LIMIT = 1024 * 1024;

export type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type GatewayDeps = {
  sessionStore: SessionStore;
  verifyToken: (token: string) => Promise<{ sid: string }>;
  allowedCidrs: string[];
  connectTcp: (opts: { host: string; port: number; timeoutMs: number }) => Promise<Socket>;
  checkOrigin: (origin: string | undefined) => boolean;
  resolveHost?: (hostname: string) => Promise<string | null>;
  isPortAllowed: (port: number) => boolean;
  idleTimeoutMs: number;
  maxDurationMs: number;
  connectTimeoutMs?: number;
  logger?: Logger;
};

export type Gateway = {
  wss: WebSocketServer;
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
};

const noopLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

export function createGateway(deps: GatewayDeps): Gateway {
  const logger = deps.logger ?? noopLogger;
  const wss = new WebSocketServer({ noServer: true });

  async function handleConnection(ws: WebSocket, req: IncomingMessage) {
    const started = Date.now();
    const url = new URL(req.url ?? "/", "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const clientIp = clientIpFrom(req);
    let bytesIn = 0;
    let bytesOut = 0;
    let sawServerData = false;
    let finished = false;
    let sid: string | null = null;
    let targetIp: string | null = null;
    let resolvedBy: string | null = null;

    const close = (code: number, reason: string) => {
      try {
        ws.close(code, reason);
      } catch {
        ws.terminate();
      }
    };

    const finish = async (endReason: string, failed: boolean) => {
      if (finished) return;
      finished = true;
      if (sid) {
        try {
          await deps.sessionStore.finish(sid, {
            bytesIn,
            bytesOut,
            endReason,
            failed,
            targetIp,
            resolvedBy,
          });
        } catch (err) {
          logger.error("[gateway] error al cerrar sesión", err);
        }
      }
    };

    if (!deps.checkOrigin(req.headers.origin)) {
      close(CLOSE_FORBIDDEN, "origin");
      await finish("origin_rejected", true);
      return;
    }

    let payload: { sid: string };
    try {
      payload = await deps.verifyToken(token);
    } catch {
      close(CLOSE_UNAUTHORIZED, "token");
      await finish("token_rejected", true);
      return;
    }
    sid = payload.sid;

    const claim = await deps.sessionStore.claim(sid, { clientIp });
    if (!claim) {
      close(CLOSE_CONFLICT, "session");
      await finish("session_rejected", true);
      return;
    }

    if (!deps.isPortAllowed(claim.targetPort)) {
      close(CLOSE_FORBIDDEN, "port");
      await finish("port_rejected", true);
      return;
    }

    let host = claim.targetIp;
    resolvedBy = "db";
    if (deps.resolveHost && claim.targetHostname) {
      const resolved = await deps.resolveHost(claim.targetHostname).catch(() => null);
      if (resolved) {
        host = resolved;
        resolvedBy = "dns";
      }
    }
    if (!host) {
      close(CLOSE_TARGET_ERROR, "dns");
      await finish("dns_error", true);
      return;
    }
    targetIp = host;

    if (!ipInCidrs(host, deps.allowedCidrs)) {
      close(CLOSE_FORBIDDEN, "cidr");
      await finish("cidr_rejected", true);
      return;
    }

    let socket: Socket;
    try {
      socket = await deps.connectTcp({
        host,
        port: claim.targetPort,
        timeoutMs: deps.connectTimeoutMs ?? 5000,
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      const reason =
        code === "ECONNREFUSED" ? "refused" : code === "ETIMEDOUT" ? "timeout" : "other";
      close(CLOSE_TARGET_ERROR, reason);
      await finish(`target_${reason}`, true);
      return;
    }

    let lastClientActivity = Date.now();
    const idleTimer = setInterval(() => {
      if (Date.now() - lastClientActivity > deps.idleTimeoutMs) {
        close(1000, "idle_timeout");
        socket.destroy();
        void finish("idle_timeout", !sawServerData);
      }
    }, 5000);
    const maxTimer = setTimeout(() => {
      close(1000, "max_duration");
      socket.destroy();
      void finish("max_duration", !sawServerData);
    }, deps.maxDurationMs);
    const pingTimer = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, PING_INTERVAL_MS);

    const cleanup = (endReason: string) => {
      clearInterval(idleTimer);
      clearTimeout(maxTimer);
      clearInterval(pingTimer);
      socket.destroy();
      void finish(endReason, !sawServerData);
    };

    socket.on("data", (chunk) => {
      sawServerData = true;
      bytesIn += chunk.length;
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk);
        if (ws.bufferedAmount > BUFFER_LIMIT) socket.pause();
      }
    });
    socket.on("drain", () => socket.resume());
    socket.on("error", () => {
      close(CLOSE_TARGET_ERROR, "target_error");
      cleanup("target_error");
    });
    socket.on("close", () => {
      if (ws.readyState === ws.OPEN) ws.close(1000, "target_closed");
      cleanup("target_closed");
    });

    ws.on("message", (data) => {
      lastClientActivity = Date.now();
      const buf = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(data as ArrayBuffer);
      bytesOut += buf.length;
      socket.write(buf);
      if (ws.bufferedAmount <= BUFFER_LIMIT) socket.resume();
    });
    ws.on("close", () => cleanup("client_closed"));
    ws.on("error", () => cleanup("client_error"));

    logger.info("[gateway] sesión activa", { sid, host, port: claim.targetPort, ms: Date.now() - started });
  }

  wss.on("connection", (ws, req) => {
    void handleConnection(ws, req).catch((err) => {
      logger.error("[gateway] error inesperado", err);
      try {
        ws.close(CLOSE_TARGET_ERROR, "internal");
      } catch {
        ws.terminate();
      }
    });
  });

  return {
    wss,
    handleUpgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    },
  };
}

function clientIpFrom(req: IncomingMessage): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.socket.remoteAddress ?? null;
}
