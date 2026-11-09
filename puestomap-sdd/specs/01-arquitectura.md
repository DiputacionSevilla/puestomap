# 01 — Arquitectura

## 1. Vista general

```
                         Red municipal (sin exposición a internet)
┌──────────────────┐  HTTPS / WSS   ┌──────────────────────────── docker1 ────────────────────────────┐
│ Navegador técnico│ ─────────────▶ │ Nginx Proxy Manager (wildcard *.mairenadelalcor.net)             │
│ (+ TightVNC      │                │   /          ──▶ web:3000      (Next.js: UI + API)               │
│  Viewer opcional)│                │   /vnc-ws    ──▶ gateway:8081  (WebSocket ↔ TCP RFB)             │
└──────┬───────────┘                │                                                                   │
       │ tightvnc://ip:5900         │  worker  (sync OCS + sondeo + tareas)                             │
       │ (modo nativo, directo)     │  postgres:5432                                                    │
       ▼                            └───────┬─────────────────────┬──────────────────────┬─────────────┘
┌──────────────────┐   TCP 5900 (RFB)       │ TCP 5900            │ HTTP REST            │
│ PCs Windows      │ ◀──────────────────────┘ (gateway y sondeo)  ▼                      │
│ TightVNC Service │ ◀───────────── TCP 445/135 (sondeo online) ─ OCS Inventory server ◀─┘
└──────────────────┘
```

## 2. Servicios

| Servicio | Tecnología | Responsabilidad |
|---|---|---|
| `web` | Next.js (App Router), Auth.js, Prisma | UI, API REST interna, autenticación, emisión de tokens de sesión remota, subida de planos |
| `gateway` | Node.js + `ws` + `pg` | Acepta WebSocket con token de un solo uso, valida, abre TCP al puesto, retransmite bytes, cierra y audita |
| `worker` | Node.js + `node-cron` + `p-limit` + Prisma | Sincronización periódica con OCS, sondeo de conectividad/VNC, limpieza de sesiones colgadas |
| `db` | PostgreSQL 17 | Persistencia |

Los tres servicios Node comparten `packages/db` y `packages/shared`. Se construyen desde **un
único Dockerfile** con un target por servicio.

## 3. Flujo de asistencia remota en navegador (modo WEB)

```
Técnico           web (Next.js)                  gateway                    PC (TightVNC)
  │ clic "Asistencia"   │                            │                           │
  │────────────────────▶│ POST /api/computers/:id/sessions {mode:WEB}            │
  │                     │ - comprueba sesión y rol (TECH/ADMIN)                   │
  │                     │ - crea RemoteSession status=PENDING                     │
  │                     │ - firma JWT {sid, exp=60s} con GATEWAY_JWT_SECRET       │
  │                     │ - descifra contraseña VNC del equipo                    │
  │◀────────────────────│ {sessionId, wsUrl:/vnc-ws?token=…, password}           │
  │ noVNC abre WSS ─────────────────────────────────▶│ verifica JWT y Origin      │
  │                     │                            │ UPDATE … SET status=ACTIVE │
  │                     │                            │  WHERE id=sid AND          │
  │                     │                            │  status=PENDING (un uso)   │
  │                     │                            │ resuelve ip:puerto en BD   │
  │                     │                            │ comprueba lista blanca CIDR│
  │                     │                            │──── TCP connect ─────────▶│
  │◀═══════════════ bytes RFB (handshake, auth VNC, framebuffer) ════════════════▶│
  │ cierra pestaña      │                            │ status=ENDED, endedAt,     │
  │                     │                            │ bytesIn/bytesOut           │
```

Notas:
- El token **solo** contiene el id de sesión; el destino se resuelve en el gateway desde la BD.
  Así no se puede forjar un destino arbitrario.
- La autenticación VNC la realiza noVNC con la contraseña recibida por HTTPS solo por un técnico
  autenticado; nunca viaja en URL ni se persiste en el navegador.
- (Fase opcional F7) El gateway podrá hacer él mismo la autenticación VNC frente al puesto y
  ofrecer `None` al navegador, de modo que la contraseña nunca llegue al cliente.

## 4. Flujo nativo (modo NATIVE)

1. Clic en "Abrir en TightVNC Viewer" → `POST /api/computers/:id/sessions {mode:NATIVE}`
   (crea registro de auditoría con status `ENDED` inmediato, duración no medible).
2. La UI navega a `tightvnc://<ip>:<puerto>`; el PC del técnico tiene registrado el protocolo
   (ver `extras/tightvnc-protocol`) y lanza `tvnviewer.exe`.
3. La UI ofrece botón "Copiar contraseña" (portapapeles) — nunca se pasa en la URL.

## 5. Decisiones técnicas

| Decisión | Alternativas valoradas | Motivo |
|---|---|---|
| Reutilizar TightVNC Server | MeshCentral, RustDesk, ISL Light | Ya está desplegado; cero coste y cero despliegue en puestos |
| Gateway propio en Node (`ws`) | websockify, Apache Guacamole | ~150 líneas, autorización integrada con nuestra BD y auditoría precisa; Guacamole queda como plan B si se necesita grabación |
| noVNC en navegador + modo nativo | Solo nativo | Web permite usarlo desde cualquier PC del dpto. sin instalar nada; nativo como alternativa conocida por los técnicos |
| Leaflet con `CRS.Simple` sobre imagen | SVG propio, Konva | Zoom/pan y marcadores resueltos; coordenadas normalizadas 0..1 |
| OCS REST API como fuente técnica | Lectura directa de MySQL de OCS | API oficial y desacoplada; lectura de BD solo si la API falla (ADR) |
| Auth local (Credentials) | LDAP/AD | 2-3 usuarios; LDAP previsto en v2 sin cambiar el modelo |

## 6. Seguridad (RNF)

| ID | Requisito |
|---|---|
| RNF-SEC-1 | Acceso a la app solo desde red interna (Access List en NPM) y con login |
| RNF-SEC-2 | Contraseñas de usuario con bcrypt (coste ≥ 12); bloqueo temporal tras 5 intentos fallidos en 10 min |
| RNF-SEC-3 | Contraseñas VNC cifradas en BD con AES-256-GCM; clave en variable de entorno `VNC_ENC_KEY` |
| RNF-SEC-4 | Tokens de gateway: JWT HS256, caducidad 60 s, un solo uso (control atómico en BD) |
| RNF-SEC-5 | El gateway valida cabecera `Origin` = `APP_URL` y que la IP destino pertenece a `ALLOWED_CIDRS` |
| RNF-SEC-6 | Sesiones remotas con timeout de inactividad (`SESSION_IDLE_TIMEOUT_MIN`, def. 30) y máximo absoluto (4 h) |
| RNF-SEC-7 | Auditoría de: login/logout, inicio/fin de sesión remota, cambios de ubicación, alta/baja de equipos, cambios de credenciales |
| RNF-SEC-8 | Cabeceras de seguridad en Next.js (CSP compatible con noVNC/Leaflet, `X-Frame-Options: DENY`) |
| RNF-SEC-9 | Recomendación operativa: los puertos VNC (5900-5904) de los puestos solo aceptarán conexiones desde `docker1` y los PCs de los técnicos (ver `07-despliegue.md` §6) |

## 7. Rendimiento y operación (RNF)

| ID | Requisito |
|---|---|
| RNF-OPS-1 | Listado de hasta 1.000 equipos con filtros en < 1 s (paginación en servidor) |
| RNF-OPS-2 | Sondeo completo del parque (≈ 500 equipos) en < 2 min con concurrencia 32 |
| RNF-OPS-3 | Cada servicio expone healthcheck; Docker reinicia servicios caídos |
| RNF-OPS-4 | Logs estructurados JSON a stdout (nivel configurable) |
| RNF-OPS-5 | Copia de seguridad diaria de la BD y del volumen de planos (documentada en `docs/operacion.md`) |
