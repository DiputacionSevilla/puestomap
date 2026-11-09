# E2E de asistencia remota (navegador real)

Comprueba de extremo a extremo la asistencia remota con un **servidor RFB falso** en el host
(no necesita ningún puesto real): login → URL nativa `tightvnc://` → visor noVNC hasta el estado
`conectado`.

Requisitos: stack levantado (dev en `:3000` o Docker en `:3100`) y Chromium de Playwright
(`npx playwright install chromium` si falta).

```powershell
$env:E2E_ADMIN_PASSWORD = "<contraseña del admin; preguntar al usuario>"
node scripts/e2e-browser/check-remote.mjs
```

## Variables (todas opcionales salvo la contraseña)

| Variable | Por defecto | Qué hace |
|---|---|---|
| `E2E_ADMIN_PASSWORD` | — | **Obligatoria**. Nunca se guarda en el repo. |
| `E2E_BASE` | `http://localhost:3000` | URL del stack. Para Docker: `http://localhost:3100` |
| `E2E_ADMIN_USER` | `admin` | Usuario de login |
| `E2E_HOSTNAME` | `E2E-BROWSER-1` | Hostname del equipo de prueba (se crea o reutiliza y archiva al final con normalidad) |
| `E2E_COMPUTER_IP` | `127.0.0.1` | IP del equipo. En Docker debe ser una IP **alcanzable desde el contenedor** y dentro de `ALLOWED_CIDRS` (p. ej. la IP LAN del host) |
| `E2E_VNC_PORT` | `5905` | Puerto VNC del servidor falso (debe estar en `VNC_ALLOWED_PORTS`) |
| `E2E_RFB_BIND` | `0.0.0.0` | Interfaz del servidor RFB falso |
| `E2E_CHECK_COMPUTER_ID` | — | Si se indica, además verifica `POST /api/computers/<id>/sessions` (detecta la imagen web desactualizada → 500 por el advisory lock) |

Sale con código 0 si el visor queda `conectado`; 1 si algo falla; 2 si falta la contraseña.
La captura se guarda en `%TEMP%\puestomap-remote-test.png`.

**Limpieza**: el script deja un equipo `E2E-*` archivable desde la propia UI (o SQL directo con el
orden de claves ajenas documentado en `AGENTS.md` §6; backup previo con `pg_dump -Fc`).
