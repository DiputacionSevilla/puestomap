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

  async function openNative() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/computers/${computer.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "NATIVE" }),
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
            <Button
              size={compact ? "sm" : "default"}
              onClick={() => window.open(`/remote/${computer.id}`, "_blank", "noopener")}
              title="Asistencia en el navegador (noVNC)"
            >
              <MonitorPlay className="h-4 w-4" />
              Asistencia
            </Button>
            <Button
              size={compact ? "sm" : "default"}
              variant="outline"
              onClick={openNative}
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
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
