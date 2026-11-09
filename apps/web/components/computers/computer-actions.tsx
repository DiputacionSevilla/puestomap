"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, MapPin, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ComputerActionTarget = {
  id: string;
  hostname: string;
  ip: string | null;
  vncPort?: number;
  placed?: boolean;
  multiState?: "SINGLE" | "MULTI_OK" | "MULTI_PENDING";
  screens?: { index: number; label: string; port: number; enabled: boolean }[];
};

const ERROR_MESSAGES: Record<string, string> = {
  SESSION_IN_USE: "",
  UNAUTHORIZED: "Sesión caducada. Vuelve a entrar.",
  FORBIDDEN: "Tu perfil no puede iniciar asistencias.",
  NOT_FOUND: "Equipo no encontrado.",
  CONFIG: "Falta la configuración de credenciales VNC en el servidor.",
};

export function ComputerActions({
  computer,
  canAssist = true,
  compact = false,
}: {
  computer: ComputerActionTarget;
  canAssist?: boolean;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockedGroup, setBlockedGroup] = useState<string | null>(null);

  async function openNative(screen: number | "desktop" = "desktop") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/computers/${computer.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "NATIVE", screen }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_MESSAGES[data?.error?.code] ?? data?.error?.message ?? "No se pudo iniciar la sesión.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  function openAllWindows() {
    const group = crypto.randomUUID();
    const screens = (computer.screens ?? []).filter((screen) => screen.enabled);
    let blocked = false;
    for (const screen of screens) {
      const popup = window.open(
        `/remote/${computer.id}?screen=${screen.index}&group=${group}`,
        `puestomap-${computer.id}-${screen.index}`,
      );
      if (popup) popup.opener = null;
      else blocked = true;
    }
    setBlockedGroup(blocked ? group : null);
  }

  async function copyPassword() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/computers/${computer.id}/vnc-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_MESSAGES[data?.error?.code] ?? data?.error?.message ?? "No se pudo obtener la contraseña.");
        return;
      }
      await navigator.clipboard.writeText(data.password);
      setNotice("Contraseña VNC copiada al portapapeles (se borra el aviso en 30 s).");
      setTimeout(() => setNotice(null), 30000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={compact ? "flex flex-wrap gap-1" : "flex flex-wrap gap-2"}>
        {canAssist ? (
          <>
            {computer.multiState === "MULTI_OK" ? (
              <div className="flex items-stretch">
                <Button size={compact ? "sm" : "default"} className="rounded-r-none" onClick={openAllWindows} title="Abrir una ventana por pantalla">
                  <MonitorPlay className="h-4 w-4" /> Asistencia
                </Button>
                <details className="relative">
                  <summary className="flex h-full cursor-pointer list-none items-center rounded-r-md border-l border-primary-foreground/30 bg-primary px-2 text-primary-foreground">▾</summary>
                  <div className="absolute right-0 z-50 mt-1 w-64 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
                    <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={openAllWindows}>Todas las pantallas (ventanas)</button>
                    <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => window.open(`/remote/${computer.id}?screens=all&layout=tiles&group=${crypto.randomUUID()}`, "_blank", "noopener")}>Todas las pantallas (mosaico)</button>
                    {(computer.screens ?? []).filter((screen) => screen.enabled).map((screen) => <button key={screen.index} className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => window.open(`/remote/${computer.id}?screen=${screen.index}`, "_blank", "noopener")}>{screen.label}</button>)}
                    <button className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent" onClick={() => window.open(`/remote/${computer.id}?screen=desktop`, "_blank", "noopener")}>Escritorio completo (unido)</button>
                  </div>
                </details>
              </div>
            ) : (
              <Button size={compact ? "sm" : "default"} onClick={() => window.open(`/remote/${computer.id}`, "_blank", "noopener")} title="Asistencia en el navegador (noVNC)">
                <MonitorPlay className="h-4 w-4" /> Asistencia
              </Button>
            )}
            <Button
              size={compact ? "sm" : "default"}
              variant="outline"
              onClick={() => void openNative()}
              disabled={busy}
              title="Abrir con TightVNC Viewer (protocolo tightvnc://)"
            >
              <ExternalLink className="h-4 w-4" />
              TightVNC
            </Button>
            <Button
              size={compact ? "sm" : "default"}
              variant="ghost"
              onClick={copyPassword}
              disabled={busy}
              title="Copiar contraseña VNC al portapapeles"
            >
              <Copy className="h-4 w-4" />
              Copiar contraseña
            </Button>
          </>
        ) : null}
        {computer.placed ? (
          <Link
            href={`/mapa?focus=${computer.id}`}
            className={compact ? "text-xs text-primary underline-offset-2 hover:underline" : "text-sm text-primary underline-offset-2 hover:underline"}
          >
            <MapPin className="mr-1 inline h-3.5 w-3.5" />
            Ver en plano
          </Link>
        ) : null}
      </div>
      {notice ? <p className="text-xs text-green-600">{notice}</p> : null}
      {computer.multiState === "MULTI_PENDING" ? <p className="text-xs text-amber-700">Este equipo parece tener varias pantallas sin configurar.</p> : null}
      {blockedGroup ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          El navegador bloqueó alguna ventana. Permite ventanas emergentes o ábrelas aquí:
          <div className="mt-1 flex flex-wrap gap-1">{(computer.screens ?? []).filter((screen) => screen.enabled).map((screen) => <Button key={screen.index} size="sm" variant="outline" onClick={() => window.open(`/remote/${computer.id}?screen=${screen.index}&group=${blockedGroup}`, "_blank", "noopener")}>{screen.label}</Button>)}</div>
        </div>
      ) : null}
      {computer.multiState === "MULTI_OK" ? <div className="flex flex-wrap gap-1 text-xs"><button className="underline" onClick={() => void openNative("desktop")}>Nativo: escritorio</button>{(computer.screens ?? []).filter((screen) => screen.enabled).map((screen) => <button className="underline" key={screen.index} onClick={() => void openNative(screen.index)}>Nativo: {screen.label}</button>)}</div> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
