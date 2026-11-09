# tasks.md — Plan de ejecución

Marca `[x]` al completar. Cada tarea cita los requisitos que cubre. Definition of Done general:
criterios de aceptación cumplidos + `npm run verify` en verde + commit.

## F0 — Base del proyecto
- [x] T-01 Monorepo npm workspaces (`apps/web`, `apps/gateway`, `apps/worker`, `packages/db`, `packages/shared`), TypeScript strict compartido, ESLint, Vitest, scripts de AGENTS.md §7 multiplataforma.
- [x] T-02 `docker-compose.dev.yml` con Postgres; `.env.example` (07 §4); `npm run gen:secrets`.
- [x] T-03 `docs/decisions.md`, `docs/blockers.md`, `docs/progress.md`, `docs/operacion.md` (esqueletos).
- [x] T-04 Next.js en `apps/web` con Tailwind + shadcn/ui, layout con barra lateral (06 §2), `/api/health`.

## F1 — Datos, seguridad y utilidades
- [x] T-05 Esquema Prisma (02 §1), migración inicial, cliente exportado desde `packages/db`.
- [x] T-06 Seed de desarrollo (DM-8) con planos SVG de ejemplo generados.
- [x] T-07 `packages/shared`: `crypto`, `token`, `cidr`, `rfb`, `hostname`, `geo`, `vnc-status` + tests T-U1…T-U7.
- [x] T-08 Auth.js Credentials + bcryptjs, middleware de rutas, bloqueo por intentos, roles (RF-01, RNF-SEC-2). Helper `requireRole()` para handlers.
- [x] T-09 Servicio de auditoría `audit(action, entity, entityId, data)` (RNF-SEC-7).

## F2 — Inventario y estructura
- [x] T-10 API de estructura física + pantallas CRUD (RF-05 CA-1, CA-4).
- [x] T-11 Subida y servicio de planos con `image-size` (RF-05 CA-2).
- [x] T-12 API `/api/computers` (listado, filtros, ficha, alta, edición, archivado) aplicando DM-1…DM-5 (RF-02, RF-03 CA-1/2/6).
- [x] T-13 Pantalla Equipos con tabla, filtros en URL, export CSV (RF-02).
- [x] T-14 Ficha de equipo (RF-03 sin mini-plano ni sondeo todavía).
- [x] T-15 Credenciales VNC (RF-14) y usuarios (RF-13).
- [x] T-16 Importación/exportación CSV de equipos y estructura con previsualización (RF-10) + T-U10.

## F3 — Worker: OCS y sondeo
- [ ] T-17 `probeComputer` en shared + T-I1; endpoint de sondeo inmediato por equipo y por planta (RF-03 CA-3, RF-09 CA-5).
- [ ] T-18 Worker: planificador (`node-cron`), sondeo periódico con `p-limit`, recálculo `vncInstalled`, healthcheck HTTP 8082 (RF-09).
- [ ] T-19 Cliente OCS + mapper contra `ocs-computer.sample.json` + T-U8, T-U9 (RF-08).
- [ ] T-20 `[STOP]` Validar el mapper con el JSON real de OCS (05 §1.1) y ajustar.
- [ ] T-21 Sync completa/incremental, `SyncRun`, "Sincronizar ahora" vía `Setting`, pantalla Ajustes > OCS (RF-08).
- [ ] T-22 Limpieza de sesiones colgadas (RF-11 CA-3).

## F4 — Mapa
- [x] T-23 `/mapa`: selector, plano Leaflet `CRS.Simple`, marcadores por estado, leyenda/contadores, panel de detalle (RF-04 CA-1/2/3/7).
- [x] T-24 Buscador en mapa y `?focus=` con resaltado; "Ver en plano" desde listado y ficha; mini-plano en ficha (RF-04 CA-4/8, RF-03 CA-4).
- [x] T-25 Modo edición: arrastrar marcadores y ubicar desde "Sin ubicar" con auditoría (RF-04 CA-5).
- [x] T-26 Refresco de estados cada 60 s (RF-04 CA-9).
- [ ] T-27 (Opcional) Rectángulos de despacho y propuesta automática de despacho (RF-05 CA-3, RF-04 CA-6).

## F5 — Asistencia remota
- [x] T-28 Gateway con `createGateway` y `sessionStore` Postgres/memoria, validaciones, contadores, ping, timeouts + T-I2 (05 §3, RNF-SEC-4/5/6).
- [x] T-29 Endpoint de creación de sesión WEB/NATIVE, conflicto 409, contraseña VNC + T-I3 (RF-06 CA-3, RF-07).
- [x] T-30 Página `/remote/[computerId]` con noVNC, barra de herramientas y mensajes de error (RF-06, 06 §5).
- [x] T-31 Modo nativo: botón `tightvnc://`, copiar contraseña, `/ayuda/tightvnc`, copiar `extras` a `public/extras` (RF-07).
- [x] T-32 Pantalla Sesiones (RF-11 CA-2) y Auditoría (RF-11 CA-1).

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
- [x] T-33 Dashboard con KPIs y buscador global `Ctrl+K` (RF-12, 06 §1).
- [ ] T-34 Cabeceras de seguridad/CSP (RNF-SEC-8), logs JSON (RNF-OPS-4).
- [ ] T-35 Dockerfile multi-target, `docker-compose.yml`, healthchecks; `docker compose up` local funcional con seed (07).
- [ ] T-36 Playwright smoke T-E1.
- [ ] T-37 `docs/operacion.md`: despliegue, NPM, firewall/GPO, copias, rotación de secretos (07 §5-8); scripts `smoke.ps1`/`smoke.sh`.
- [ ] T-38 `[STOP]` Checklist de aceptación manual con red real (08 §5).

## F7 — Mejora opcional (no iniciar sin confirmación)
- [ ] T-39 Autenticación VNC en el gateway: el gateway negocia "VNC Authentication" (DES) con el puesto usando la credencial descifrada y ofrece `None` al navegador, de modo que la contraseña nunca llegue al cliente. Requiere implementación DES compatible (OpenSSL 3 puede no ofrecer `des-ecb`). Tests con servidor RFB falso que exija auth.
- [ ] T-40 Login contra Active Directory (LDAP) manteniendo usuarios locales de emergencia.
- [ ] T-41 Sincronización de ubicaciones con GLPI (`externalRef`).

## F8 — CR-01: carga de ubicaciones, planos y usuarios del dominio (specs/10)
- [x] T-50 Reconciliación y ADR (§0); tabla en `docs/progress.md`.
- [x] T-51 Modelo (§3): migración aditiva, backfill de `lastUserNorm`, mapper OCS escribe `lastUserNorm`, `.env.example`.
- [x] T-52 `shared`: `keys`, `ad-user`, `name-match`, `geo` (ampliado), `svg-validate` + T-U12…T-U15.
- [x] T-53 Planos: validación y servicio seguro de SVG/imagen, aviso de proporción, cabeceras (§5.4).
- [x] T-54 Importación de estructura con `rect_*`, lectura por cabecera, informe y reglas (§5.1) + T-U10+.
- [x] T-55 Importación de equipos ampliada (§5.2), `errores.csv`, opciones `crearEquipos`/`omitirErrores` + T-U10+.
- [ ] T-56 Asistente `/importar/carga-inicial` pasos 1, 2 y 4 (RF-16).
- [x] T-57 Mapa: despacho automático al soltar (RF-04 CA-6), capa de despachos, tooltip, etiqueta configurable, filtro de departamento (CA-10…13).
- [ ] T-58 Fixtures `fixtures/carga-ayto/` y pruebas de aceptación T-I5 (+ T-E2 opcional).
- [ ] T-59 Directorio: importación, autocompletado, sugerencias, ficha, búsqueda; paso 3 del asistente (RF-17).
- [ ] T-60 Listado/ficha/mapa: columna y filtro de usuario, icono de discrepancia, parámetro `check` (RF-02/03).
- [ ] T-61 `/calidad`, `/api/quality`, export CSV y enlace desde el dashboard (RF-18).
- [x] T-62 Identidad del equipo: resolución DNS en el gateway, `desktopname` en el visor, endpoint e iconos (RF-19) + T-I6.
- [ ] T-63 `[STOP]` Carga real: el humano importa estructura, planos y equipos reales y valida con la checklist de §13; el agente anota hallazgos en `docs/progress.md`.
- [ ] T-64 (P2, solo si se pide) Importar `ad-equipos.csv` como fuente secundaria de hostname/IP.
