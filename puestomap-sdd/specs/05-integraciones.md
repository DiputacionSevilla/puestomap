# 05 — Integraciones

## 1. OCS Inventory — API REST

Raíz: `OCS_API_URL` (p. ej. `http://ocs.local/ocsapi/v1`). Autenticación HTTP Basic con
`OCS_API_USER` / `OCS_API_PASSWORD` (si el servidor no la exige, se omite).

Rutas a usar:

| Uso | Ruta |
|---|---|
| IDs de todos los equipos | `GET /computers/listID` → `[{"ID":1942}, …]` |
| IDs modificados recientemente | `GET /computers/lastupdate/:segundos` |
| Detalle completo de un equipo | `GET /computer/:id` |
| Sección concreta | `GET /computer/:id/:section` (`hardware`, `bios`, `networks`, `softwares`, `accountinfo`, `drives`) |
| Listado por lotes (alternativa) | `GET /computers?start=:n&limit=:m` |

### 1.1 Procedimiento obligatorio antes de escribir el mapper `[STOP]`
Los nombres de campo de OCS varían entre versiones. El agente debe:
1. Pedir al humano que ejecute en PowerShell y guarde el resultado de un equipo real:
   ```powershell
   $cred = Get-Credential
   Invoke-RestMethod -Uri "http://<servidor-ocs>/ocsapi/v1/computer/<ID>" -Credential $cred |
     ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 ocs-computer.json
   ```
2. Anonimizar y guardar el fichero en `apps/worker/test/fixtures/ocs-computer.json`.
3. Hasta tenerlo, desarrollar contra `ocs-computer.sample.json` (creado por el agente con los
   campos de la tabla siguiente) y marcar la tarea de validación con el real como pendiente.

### 1.2 Mapeo (orientativo; validar con el fixture real)

| Campo PuestoMap | Origen OCS |
|---|---|
| `ocsId` | `hardware.ID` (clave del objeto raíz) |
| `hostname` | `hardware.NAME` |
| `ip` | `hardware.IPADDR`; si vacío, primera IPv4 de `networks[].IPADDRESS` con `STATUS = Up` |
| `mac` | `networks[].MACADDR` de la interfaz de `ip` |
| `domain` | `hardware.WORKGROUP` o `hardware.USERDOMAIN` |
| `lastUser` | `hardware.USERID` |
| `os` / `osVersion` | `hardware.OSNAME` / `hardware.OSVERSION` |
| `cpu` | `hardware.PROCESSORT` |
| `ramMb` | `hardware.MEMORY` |
| `diskGb` | suma de `drives[].TOTAL` (MB) de tipo disco fijo / 1024 |
| `manufacturer` / `model` / `serial` | `bios.SMANUFACTURER` / `bios.SMODEL` / `bios.SSN` |
| `ocsLastInventory` | `hardware.LASTDATE` |
| `monitorCount` | nº de elementos de la sección `monitors` (`null` si no existe); solo pista, ver 09 |
| `vncInstalled` / `vncVersion` | `softwares[]` cuyo `NAME` coincide con `/tightvnc/i` → `YES` y `VERSION` |
| (opcional) pista de ubicación | `accountinfo[].TAG` → se muestra en la ficha como "Etiqueta OCS"; no se usa para ubicar automáticamente |

Implementación: `apps/worker/src/ocs/client.ts` (fetch con timeout 15 s, reintentos 2 con
backoff) y `apps/worker/src/ocs/mapper.ts` (**función pura** `mapOcsComputer(json) → ComputerUpsert`).
Concurrencia de peticiones de detalle: 4.

Si la API REST no está habilitada en el servidor OCS, registrar ADR y ofrecer como alternativa
la lectura directa en solo lectura de la BD MySQL de OCS (tablas `hardware`, `bios`,
`networks`, `softwares`) con un usuario de solo lectura. **No** implementarla sin confirmación.

## 2. Sondeo de red (`packages/shared/probe.ts`)

```ts
type ProbeResult = {
  online: boolean | null;          // null = indeterminado
  vncReachable: boolean;
  rfbVersion?: string;             // "003.008"
  error?: "timeout" | "refused" | "bad_banner" | "dns" | "other";
  ms: number;
};
probeComputer(target: { host: string; vncPort: number }, opts: {
  timeoutMs: number; onlinePorts: number[];
}): Promise<ProbeResult>;
```

Algoritmo:
1. `net.connect(vncPort)`; al recibir datos acumular hasta 12 bytes; validar con
   `/^RFB (\d{3}\.\d{3})\n$/` (`parseRfbBanner` en `shared/rfb.ts`); destruir el socket.
2. `ECONNREFUSED` → `online=true, vncReachable=false, error="refused"`.
3. Timeout → para cada puerto de `onlinePorts` en paralelo: si alguno conecta o rechaza →
   `online=true`; si todos expiran → `online=false`.
4. Banner inválido → `online=true, vncReachable=false, error="bad_banner"`.

Nota: el contenedor no necesita privilegios (no se usa ICMP).

## 3. Gateway WebSocket ↔ RFB (`apps/gateway`)

Requisitos:
- Escucha en `GATEWAY_PORT` (8081). Rutas: `GET /health` (HTTP) y upgrade WS en `/vnc-ws`.
- Subprotocolo: aceptar `binary` si el cliente lo ofrece (noVNC lo usa); en otro caso, sin subprotocolo.
- Validaciones en el upgrade (rechazar con cierre WS y código):
  | Comprobación | Código cierre |
  |---|---|
  | `Origin` ≠ `APP_URL` | 4403 |
  | Token ausente / firma inválida / caducado | 4401 |
  | Sesión no `PENDING` o creada hace > 60 s (ya usada) | 4409 |
  | IP destino fuera de `ALLOWED_CIDRS` | 4403 |
  | `targetPort` (leído de `RemoteSession`) fuera de `VNC_ALLOWED_PORTS` | 4403 |
  | Error TCP al conectar al puesto | 4502 (con `reason` = `refused`/`timeout`) |
- Transición atómica de la sesión:
  ```sql
  UPDATE "RemoteSession" SET status='ACTIVE', "startedAt"=now(), "targetIp"=$2, "clientIp"=$3
  WHERE id=$1 AND status='PENDING' AND "createdAt" > now() - interval '60 seconds'
  RETURNING id;
  ```
- Retransmisión bidireccional con contadores `bytesIn`/`bytesOut`; backpressure respetando
  `ws.bufferedAmount` y `socket.pause()/resume()`.
- Ping WS cada 25 s (evita cortes del proxy). Timeout de inactividad: sin tráfico **desde el
  cliente** durante `SESSION_IDLE_TIMEOUT_MIN` → cierre `idle_timeout`. Máximo 4 h → `max_duration`.
- Al cerrar (cualquier extremo): `status='ENDED'` (o `FAILED` si nunca llegó a transmitir datos
  del servidor), `endedAt`, bytes, `endReason`.
- Diseño testeable: `createGateway({ sessionStore, verifyToken, allowedCidrs, connectTcp, logger })`
  donde `sessionStore` es una interfaz (`claim(sid, meta)`, `finish(sid, stats)`) con
  implementación Postgres (`pg`) y una en memoria para tests.

## 4. Cliente noVNC (`apps/web`)

- Página cliente `/remote/[computerId]` (componente con `"use client"`). Importar RFB de forma
  dinámica dentro de `useEffect` (`await import("@novnc/novnc/lib/rfb")` o la ruta que exponga la
  versión instalada) para evitar SSR.
- Riesgo conocido: algunas versiones de noVNC usan `await` de nivel superior que da problemas al
  empaquetar. Si ocurre: (a) fijar la versión que funcione, o (b) copiar `node_modules/@novnc/novnc`
  a `public/novnc/` en un script `postinstall` multiplataforma (Node) y cargarlo como módulo ES
  nativo. Registrar la elección en ADR.
- Conexión: `new RFB(container, wssUrl, { credentials: { password }, wsProtocols: ["binary"] })`,
  `scaleViewport = true`, `resizeSession = false`, `qualityLevel = 6`, `compressionLevel = 2`.
- Eventos a manejar: `connect`, `disconnect` (`detail.clean`), `credentialsrequired`,
  `securityfailure` (contraseña VNC incorrecta), `clipboard`, `desktopname` (título de pestaña).
- La contraseña se mantiene solo en memoria del componente y se descarta tras conectar.
- `beforeunload` → `navigator.sendBeacon('/api/sessions/:id/end')`.

## 5. Protocolo `tightvnc://` en los PCs de los técnicos

Ficheros en `extras/tightvnc-protocol/` (ya incluidos en el pack; el agente los copia a
`apps/web/public/extras/`):
- `tightvnc-launch.ps1`: valida estrictamente la URL (`^tightvnc://host(:puerto)?/?$`, host solo
  `[A-Za-z0-9.-]`), localiza `tvnviewer.exe` y lo lanza con `host::puerto`.
- `instalar.ps1`: copia el lanzador a `%LOCALAPPDATA%\PuestoMap\` y registra el protocolo en
  `HKCU\Software\Classes\tightvnc` (no requiere administrador).
- `desinstalar.ps1`: revierte lo anterior.

La UI genera `tightvnc://<ip|hostname>:<vncPort>`.

## 6. Formatos CSV (UTF-8 con BOM, separador `;` para abrir bien en Excel español)

### 6.1 Equipos
```
hostname;ip;asignado_a;extension;edificio_codigo;planta_nombre;despacho_codigo;departamento_codigo;pos_x;pos_y;puerto_vnc;credencial;notas;asset_tag
PC-INT-01;10.1.2.34;María López;2104;CASA-CONSIST;Primera;P1-07;INTERV;0.4215;0.3380;5900;Estándar 2024;;INV-00123
```
Reglas: `hostname` obligatorio; `pos_x/pos_y` decimales con punto, 0..1; si se da despacho,
debe pertenecer a la planta indicada. Celda vacía = no modificar.

### 6.2 Estructura
```
tipo;codigo;nombre;edificio_codigo;planta_nombre;nivel;departamento_codigo
EDIFICIO;CASA-CONSIST;Casa Consistorial;;;;
PLANTA;;Primera;CASA-CONSIST;;1;
DEPARTAMENTO;INTERV;Intervención;;;;
DESPACHO;P1-07;Despacho Intervención;CASA-CONSIST;Primera;;INTERV
```
