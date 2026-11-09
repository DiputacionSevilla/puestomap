"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardPaste,
  Expand,
  LogOut,
  MousePointer2,
  RefreshCw,
  Scan,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type RfbConnection = {
  addEventListener: (type: string, handler: (event: { detail?: unknown }) => void) => void;
  removeEventListener: (type: string, handler: (event: { detail?: unknown }) => void) => void;
  sendCtrlAltDel: () => void;
  clipboardPasteFrom: (text: string) => void;
  disconnect: () => void;
  scaleViewport: boolean;
  resizeSession: boolean;
  viewOnly: boolean;
  qualityLevel: number;
  compressionLevel: number;
};

type RfbModule = {
  default: new (
    target: HTMLElement,
    url: string,
    options?: Record<string, unknown>,
  ) => RfbConnection;
};

type SessionInfo = {
  sessionId: string;
  wsUrl: string;
  password: string | null;
  hostname: string;
  targetPort: number;
  screenLabel: string | null;
};

type ConflictInfo = { by: string; since: string };

const CLOSE_MESSAGES: Record<number, string> = {
  4401: "La autorización de conexión ha caducado. Reintentar.",
  4409: "Esta autorización ya se utilizó. Reintentar.",
  4403: "La IP del equipo no está en la red permitida para asistencia.",
};

function instrumentWebSocket() {
  const Original = window.WebSocket;
  let lastClose = { code: 0, reason: "" };
  const Wrapped = function (this: unknown, url: string | URL, protocols?: string | string[]) {
    const ws = new Original(url, protocols);
    ws.addEventListener("close", (ev) => {
      lastClose = { code: ev.code, reason: ev.reason };
    });
    return ws;
  } as unknown as typeof WebSocket;
  window.WebSocket = Wrapped;
  return {
    restore: () => {
      window.WebSocket = Original;
    },
    lastClose: () => lastClose,
  };
}

export function RfbViewer({ computerId }: { computerId: string }) {
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RfbConnection | null>(null);
  const instrumentRef = useRef<ReturnType<typeof instrumentWebSocket> | null>(null);
  const [status, setStatus] = useState<"init" | "connecting" | "connected" | "error" | "ended">("init");
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [identityWarning, setIdentityWarning] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("00:00");
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    setAskReason(window.localStorage.getItem("pm-ask-reason") !== "off");
  }, []);

  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      setElapsed(
        `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const connectRef = useRef<(force: boolean) => Promise<void>>(async () => undefined);

  const connect = useCallback(
    async (force: boolean) => {
      setStatus("connecting");
      setMessage(null);
      setConflict(null);
      setIdentityWarning(null);

      const res = await fetch(`/api/computers/${computerId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "WEB", reason: reason || undefined, force }),
      });
      const data = await res.json();
      if (res.status === 409 && data?.error?.code === "SESSION_IN_USE") {
        setConflict({
          by: data.error.details?.by ?? "otro usuario",
          since: data.error.details?.since ?? "",
        });
        setStatus("init");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error?.message ?? "No se pudo iniciar la sesión.");
        return;
      }

      const info: SessionInfo = data;
      setSession(info);
      try {
        const url = new URL(info.wsUrl, window.location.href);
        const wssUrl = `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}${url.pathname}${url.search}`;
        const instrument = instrumentWebSocket();
        instrumentRef.current = instrument;
        const novncUrl = "/novnc/core/rfb.js";
        const mod = (await import(
          /* webpackIgnore: true */ novncUrl
        )) as unknown as RfbModule;

        if (!screenRef.current) return;
        const rfb = new mod.default(screenRef.current, wssUrl, {
          credentials: { password: info.password ?? "" },
          wsProtocols: ["binary"],
        });
        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        rfb.qualityLevel = 6;
        rfb.compressionLevel = 2;
        rfbRef.current = rfb;

        rfb.addEventListener("connect", () => {
          setStatus("connected");
          setStartedAt(new Date());
        });
        rfb.addEventListener("disconnect", () => {
          const close = instrument.lastClose();
          instrument.restore();
          setStatus("ended");
          setStartedAt(null);
          if (close.code && CLOSE_MESSAGES[close.code]) {
            setMessage(CLOSE_MESSAGES[close.code]);
          } else if (close.code === 4502) {
            setMessage(
              close.reason === "timeout"
                ? "El equipo no responde (apagado o fuera de la red)."
                : "El equipo responde pero TightVNC no acepta conexiones (servicio parado o firewall).",
            );
          } else if (close.code !== 1000) {
            setMessage("La conexión se ha cerrado.");
          }
        });
        rfb.addEventListener("securityfailure", () => {
          setStatus("error");
          setMessage("Contraseña VNC incorrecta. Revisa la credencial asignada al equipo.");
        });
        rfb.addEventListener("credentialsrequired", () => {
          setStatus("error");
          setMessage("El servidor VNC pide credenciales.");
        });
        rfb.addEventListener("desktopname", (event) => {
          const name = String((event.detail as { name?: string } | undefined)?.name ?? "");
          if (!name) return;
          void fetch(`/api/sessions/${info.sessionId}/identity`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ desktopName: name }),
          })
            .then((r) => r.json())
            .then((r: { identityOk?: boolean }) => {
              if (r.identityOk === false) {
                setIdentityWarning(
                  `El equipo se identifica como "${name}", no como "${info.hostname}". Comprueba que es el correcto.`,
                );
              }
            })
            .catch(() => undefined);
        });
      } catch {
        setStatus("error");
        setMessage("No se pudo cargar el visor noVNC.");
      }
    },
    [computerId, reason],
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!askReason) {
      void connectRef.current(false);
    }
  }, [askReason]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (session) {
        navigator.sendBeacon(
          `/api/sessions/${session.sessionId}/end`,
          new Blob([], { type: "application/json" }),
        );
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [session]);

  const rfb = rfbRef.current;

  return (
    <div className="flex h-screen flex-col bg-black text-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/20 px-3 py-2 text-sm">
        <span className="font-semibold">{session?.hostname ?? "Asistencia remota"}</span>
        {session?.screenLabel ? <span className="text-white/70">· {session.screenLabel}</span> : null}
        <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs">
          {status === "connected"
            ? "conectado"
            : status === "connecting"
              ? "conectando…"
              : status === "error"
                ? "error"
                : status === "ended"
                  ? "desconectado"
                  : "listo"}
        </span>
        <span className="text-xs text-white/70">{elapsed}</span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10"
            disabled={status !== "connected"}
            onClick={() => rfb?.sendCtrlAltDel()}
            title="Enviar Ctrl+Alt+Supr"
          >
            <Send className="h-4 w-4" />
            Ctrl+Alt+Supr
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10"
            disabled={status !== "connected"}
            onClick={() => {
              const el = screenRef.current;
              if (!el) return;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void el.requestFullscreen();
            }}
            title="Pantalla completa"
          >
            <Expand className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10"
            disabled={status !== "connected"}
            onClick={() => {
              if (!rfb) return;
              rfb.scaleViewport = !rfb.scaleViewport;
              rfb.resizeSession = !rfb.scaleViewport && false;
            }}
            title="Ajustar a ventana / tamaño real"
          >
            <Scan className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10"
            disabled={status !== "connected"}
            onClick={() => {
              if (!rfb) return;
              rfb.viewOnly = !rfb.viewOnly;
              setMessage(rfb.viewOnly ? "Modo solo ver." : null);
            }}
            title="Solo ver"
          >
            <MousePointer2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10"
            disabled={status !== "connected"}
            onClick={() => {
              const text = window.prompt("Texto a enviar al equipo remoto:");
              if (text && rfb) rfb.clipboardPasteFrom(text);
            }}
            title="Enviar texto del portapapeles"
          >
            <ClipboardPaste className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              rfb?.disconnect();
              window.close();
            }}
            title="Desconectar"
          >
            <LogOut className="h-4 w-4" />
            Desconectar
          </Button>
        </div>
      </div>

      {identityWarning ? (
        <div className="flex items-center gap-3 bg-red-700 px-3 py-2 text-sm">
          <span>{identityWarning}</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => {
              rfb?.disconnect();
              window.close();
            }}
          >
            Desconectar
          </Button>
        </div>
      ) : null}

      {message ? (
        <div className="flex items-center gap-3 bg-amber-600 px-3 py-2 text-sm text-black">
          <span>{message}</span>
          {status === "ended" || status === "error" ? (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => {
                setMessage(null);
                void connectRef.current(false);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}

      {conflict ? (
        <div className="flex items-center gap-3 bg-amber-600 px-3 py-2 text-sm text-black">
          <span>
            {conflict.by} está conectado a este equipo
            {conflict.since ? ` desde las ${new Date(conflict.since).toLocaleTimeString("es-ES")}` : ""}.
            ¿Conectar igualmente?
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.close()}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void connectRef.current(true)}>
              Conectar
            </Button>
          </div>
        </div>
      ) : null}

      {askReason && status === "init" && !conflict ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-96 rounded-lg bg-white/10 p-4 text-sm">
            <p className="mb-2 font-medium">Motivo / nº de incidencia (opcional)</p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. incidencia 2026-0123"
              className="mb-3 w-full rounded border border-white/20 bg-transparent px-2 py-1"
            />
            <label className="mb-3 flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                onChange={(e) => {
                  if (e.target.checked) window.localStorage.setItem("pm-ask-reason", "off");
                }}
              />
              No volver a preguntar
            </label>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="text-white" onClick={() => void connectRef.current(false)}>
                Omitir
              </Button>
              <Button size="sm" onClick={() => void connectRef.current(false)}>
                Conectar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div ref={screenRef} className="min-h-0 flex-1 bg-black" />
    </div>
  );
}
