import net from "node:net";
import { parseRfbBanner } from "./rfb.js";

export type ProbeError = "timeout" | "refused" | "bad_banner" | "dns" | "other";

export type ProbeResult = {
  online: boolean | null;
  vncReachable: boolean;
  rfbVersion?: string;
  error?: ProbeError;
  ms: number;
};

export type PortProbeResult =
  | { status: "banner"; version: string }
  | { status: "refused" }
  | { status: "timeout" }
  | { status: "bad_banner" }
  | { status: "dns" }
  | { status: "other" };

export type PortProbeFn = (
  host: string,
  port: number,
  timeoutMs: number,
) => Promise<PortProbeResult>;

function classifyError(err: unknown): PortProbeResult {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ECONNREFUSED") return { status: "refused" };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EAI_NONAME") {
    return { status: "dns" };
  }
  return { status: "other" };
}

export const probeTcpPort: PortProbeFn = (host, port, timeoutMs) => {
  return new Promise<PortProbeResult>((resolve) => {
    let settled = false;
    let buffer = Buffer.alloc(0);
    const done = (result: PortProbeResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs, () => done({ status: "timeout" }));
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length >= 12) {
        const version = parseRfbBanner(buffer);
        if (version) done({ status: "banner", version });
        else done({ status: "bad_banner" });
      }
    });
    socket.on("error", (err) => done(classifyError(err)));
    socket.on("close", () => {
      if (!settled) {
        if (buffer.length > 0) done({ status: "bad_banner" });
        else done({ status: "other" });
      }
    });
  });
};

export async function probeComputer(
  target: { host: string; vncPort: number },
  opts: { timeoutMs: number; onlinePorts: number[] },
  probePort: PortProbeFn = probeTcpPort,
): Promise<ProbeResult> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  const vnc = await probePort(target.host, target.vncPort, opts.timeoutMs);

  if (vnc.status === "banner") {
    return {
      online: true,
      vncReachable: true,
      rfbVersion: vnc.version,
      ms: elapsed(),
    };
  }
  if (vnc.status === "refused") {
    return {
      online: true,
      vncReachable: false,
      error: "refused",
      ms: elapsed(),
    };
  }
  if (vnc.status === "bad_banner") {
    return {
      online: true,
      vncReachable: false,
      error: "bad_banner",
      ms: elapsed(),
    };
  }
  if (vnc.status === "dns") {
    return {
      online: null,
      vncReachable: false,
      error: "dns",
      ms: elapsed(),
    };
  }
  if (vnc.status === "timeout") {
    const results = await Promise.all(
      opts.onlinePorts.map((port) => probePort(target.host, port, opts.timeoutMs)),
    );
    const alive = results.some(
      (r) => r.status === "banner" || r.status === "bad_banner" || r.status === "refused",
    );
    return {
      online: alive,
      vncReachable: false,
      error: "timeout",
      ms: elapsed(),
    };
  }
  return {
    online: null,
    vncReachable: false,
    error: "other",
    ms: elapsed(),
  };
}
