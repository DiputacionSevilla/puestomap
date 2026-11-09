# tasks.md — Plan de ejecución

Marca `[x]` al completar. Cada tarea cita los requisitos que cubre. Definition of Done general:
criterios de aceptación cumplidos + `npm run verify` en verde + commit.

## F0 — Base del proyecto
- [x] T-01 Monorepo npm workspaces (`apps/web`, `apps/gateway`, `apps/worker`, `packages/db`, `packages/shared`), TypeScript strict compartido, ESLint, Vitest, scripts de AGENTS.md §7 multiplataforma.
- [x] T-02 `docker-compose.dev.yml` con Postgres; `.env.example` (07 §4); `npm run gen:secrets`.
- [x] T-03 `docs/decisions.md`, `docs/blockers.md`, `docs/progress.md`, `docs/operacion.md` (esqueletos).
- [ ] T-04 Next.js en `apps/web` con Tailwind + shadcn/ui, layout con barra lateral (06 §2), `/api/health`.

## F1 — Datos, seguridad y utilidades
- [x] T-05 Esquema Prisma (02 §1), migración inicial, cliente exportado desde `packages/db`.
- [x] T-06 Seed de desarrollo (DM-8) con planos SVG de ejemplo generados.
- [x] T-07 `packages/shared`: `crypto`, `token`, `cidr`, `rfb`, `hostname`, `geo`, `vnc-status` + tests T-U1…T-U7.
- [ ] T-08 Auth.js Credentials + bcryptjs, middleware de rutas, bloqueo por intentos, roles (RF-01, RNF-SEC-2). Helper `requireRole()` para handlers.
- [ ] T-09 Servicio de auditoría `audit(action, entity, entityId, data)` (RNF-SEC-7).

## F2 — Inventario y estructura
- [ ] T-10 API de estructura física + pantallas CRUD (RF-05 CA-1, CA-4).
- [ ] T-11 Subida y servicio de planos con `image-size` (RF-05 CA-2).
- [ ] T-12 API `/api/computers` (listado, filtros, ficha, alta, edición, archivado) aplicando DM-1…DM-5 (RF-02, RF-03 CA-1/2/6).
- [ ] T-13 Pantalla Equipos con tabla, filtros en URL, export CSV (RF-02).
- [ ] T-14 Ficha de equipo (RF-03 sin mini-plano ni sondeo todavía).
- [ ] T-15 Credenciales VNC (RF-14) y usuarios (RF-13).
- [ ] T-16 Importación/exportación CSV de equipos y estructura con previsualización (RF-10) + T-U10.

## F3 — Worker: OCS y sondeo
- [ ] T-17 `probeComputer` en shared + T-I1; endpoint de sondeo inmediato por equipo y por planta (RF-03 CA-3, RF-09 CA-5).
- [ ] T-18 Worker: planificador (`node-cron`), sondeo periódico con `p-limit`, recálculo `vncInstalled`, healthcheck HTTP 8082 (RF-09).
- [ ] T-19 Cliente OCS + mapper contra `ocs-computer.sample.json` + T-U8, T-U9 (RF-08).
- [ ] T-20 `[STOP]` Validar el mapper con el JSON real de OCS (05 §1.1) y ajustar.
- [ ] T-21 Sync completa/incremental, `SyncRun`, "Sincronizar ahora" vía `Setting`, pantalla Ajustes > OCS (RF-08).
- [ ] T-22 Limpieza de sesiones colgadas (RF-11 CA-3).

## F4 — Mapa
- [ ] T-23 `/mapa`: selector, plano Leaflet `CRS.Simple`, marcadores por estado, leyenda/contadores, panel de detalle (RF-04 CA-1/2/3/7).
- [ ] T-24 Buscador en mapa y `?focus=` con resaltado; "Ver en plano" desde listado y ficha; mini-plano en ficha (RF-04 CA-4/8, RF-03 CA-4).
- [ ] T-25 Modo edición: arrastrar marcadores y ubicar desde "Sin ubicar" con auditoría (RF-04 CA-5).
- [ ] T-26 Refresco de estados cada 60 s (RF-04 CA-9).
- [ ] T-27 (Opcional) Rectángulos de despacho y propuesta automática de despacho (RF-05 CA-3, RF-04 CA-6).

## F5 — Asistencia remota
- [ ] T-28 Gateway con `createGateway` y `sessionStore` Postgres/memoria, validaciones, contadores, ping, timeouts + T-I2 (05 §3, RNF-SEC-4/5/6).
- [ ] T-29 Endpoint de creación de sesión WEB/NATIVE, conflicto 409, contraseña VNC + T-I3 (RF-06 CA-3, RF-07).
- [ ] T-30 Página `/remote/[computerId]` con noVNC, barra de herramientas y mensajes de error (RF-06, 06 §5).
- [ ] T-31 Modo nativo: botón `tightvnc://`, copiar contraseña, `/ayuda/tightvnc`, copiar `extras` a `public/extras` (RF-07).
- [ ] T-32 Pantalla Sesiones (RF-11 CA-2) y Auditoría (RF-11 CA-1).

## F5b — Multipantalla (09-multipantalla.md; tras F5, antes de F6)
- [ ] T-42 `[STOP]` Piloto en un PC con doble monitor (09 §7): validar sintaxis de puertos extra, numeración de pantallas y conexiones simultáneas; guardar `pilot.reg` en `docs/pilot-multimonitor/` y registrar resultados en `docs/decisions.md`. Lo hace el humano; conviene hacerlo antes de empezar F5.
- [ ] T-43 Modelo: `ComputerScreen`, `monitorCount` y campos nuevos de `RemoteSession` (02) + migración + seed con 4 equipos de 2 pantallas y 1 de 3.
- [ ] T-44 Mapper OCS (`monitorCount`) y `shared/screens.ts` (puertos, validación, `deriveMultiState`) + T-U11.
- [ ] T-45 Worker: descubrimiento y sondeo por pantalla (09 §3) + T-I4; API de pantallas (`GET/PUT /screens`, `/discover`) y pestaña "Pantallas" en la ficha (RF-15 CA-1/2).
- [ ] T-46 API de sesiones y gateway con `targetPort`, `groupId`, y conflicto solo con otros usuarios + T-I2 (g) (RF-15 CA-7).
- [ ] T-47 Visor: botón dividido, ventanas separadas, mosaico, "Desconectar todas", respaldo ante popups bloqueados, enlaces nativos por pantalla y nota de limitación en `/ayuda/tightvnc` (RF-15 CA-3…CA-6, CA-9).
- [ ] T-48 Filtro y KPI "multipantalla pendiente de configurar" e icono ▭▭ en listado y mapa (RF-15 CA-8).
- [ ] T-49 Con el resultado del piloto: `extras/tightvnc-multimonitor/configurar-pantallas.ps1` (idempotente: puertos extra, regla de firewall, reinicio del servicio `tvnserver`) y guía de despliegue por GPO en `docs/operacion.md`.

## F6 — Cierre v1
- [ ] T-33 Dashboard con KPIs y buscador global `Ctrl+K` (RF-12, 06 §1).
- [ ] T-34 Cabeceras de seguridad/CSP (RNF-SEC-8), logs JSON (RNF-OPS-4).
- [ ] T-35 Dockerfile multi-target, `docker-compose.yml`, healthchecks; `docker compose up` local funcional con seed (07).
- [ ] T-36 Playwright smoke T-E1.
- [ ] T-37 `docs/operacion.md`: despliegue, NPM, firewall/GPO, copias, rotación de secretos (07 §5-8); scripts `smoke.ps1`/`smoke.sh`.
- [ ] T-38 `[STOP]` Checklist de aceptación manual con red real (08 §5).

## F7 — Mejora opcional (no iniciar sin confirmación)
- [ ] T-39 Autenticación VNC en el gateway: el gateway negocia "VNC Authentication" (DES) con el puesto usando la credencial descifrada y ofrece `None` al navegador, de modo que la contraseña nunca llegue al cliente. Requiere implementación DES compatible (OpenSSL 3 puede no ofrecer `des-ecb`). Tests con servidor RFB falso que exija auth.
- [ ] T-40 Login contra Active Directory (LDAP) manteniendo usuarios locales de emergencia.
- [ ] T-41 Sincronización de ubicaciones con GLPI (`externalRef`).
