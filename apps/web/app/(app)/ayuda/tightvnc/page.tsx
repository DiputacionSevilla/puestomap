import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function AyudaTightVncPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ayuda: asistencia con TightVNC Viewer</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Modo nativo (TightVNC Viewer)</CardTitle>
          <CardDescription>
            Alternativa al asistencia en navegador: abre el visor instalado en tu PC.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Descarga e instala el lanzador del protocolo <code>tightvnc://</code> en tu PC (no
              requiere administrador):
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                  href="/extras/instalar.ps1"
                  download
                >
                  instalar.ps1
                </a>
                <a
                  className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                  href="/extras/desinstalar.ps1"
                  download
                >
                  desinstalar.ps1
                </a>
                <a
                  className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent"
                  href="/extras/tightvnc-launch.ps1"
                  download
                >
                  tightvnc-launch.ps1
                </a>
              </div>
            </li>
            <li>
              Ejecuta <code>instalar.ps1</code> (clic derecho → «Ejecutar con PowerShell»). Registra
              el protocolo <code>tightvnc://</code> para tu usuario.
            </li>
            <li>
              En la ficha de cada equipo, el botón <b>TightVNC</b> lanza el visor directamente. El
              botón <b>Copiar contraseña</b> la deja en el portapapeles durante 30 s (el registro de
              auditoría queda actualizado).
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Requisitos: TightVNC Viewer instalado (incluido en la instalación de TightVNC) y acceso a
            la red municipal. La contraseña VNC nunca viaja en la URL.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Limitaciones conocidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            En equipos con varias pantallas, cada sesión muestra una pantalla: el ratón no puede
            cruzar de una pantalla a otra. Para arrastrar ventanas entre monitores del equipo remoto
            usa «Escritorio completo (unido)» o el atajo <code>Win+Mayús+←/→</code> en el puesto.
          </p>
          <p>
            El tráfico VNC clásico no va cifrado: el firewall de los puestos debe restringir los
            puertos 5900-5904 a los PCs de Informática (ver <code>docs/operacion.md</code>).
          </p>
        </CardContent>
      </Card>

      <p className="text-sm">
        <Link href="/" className="text-primary underline-offset-2 hover:underline">
          ← Volver al inicio
        </Link>
      </p>
    </div>
  );
}
