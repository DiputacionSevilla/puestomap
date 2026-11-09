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
- [x] T-17 `probeComputer` en shared + T-I1; endpoint de sondeo inmediato por equipo y por planta (RF-03 CA-3, RF-09 CA-5).
- [x] T-18 Worker: planificador (`node-cron`), sondeo periódico con `p-limit`, recálculo `vncInstalled`, healthcheck HTTP 8082 (RF-09).
- [x] T-19 Cliente OCS + mapper contra `ocs-computer.sample.json` + T-U8, T-U9 (RF-08).
- [ ] T-20 `[STOP]` Validar el mapper con el JSON real de OCS (05 §1.1) y ajustar.
- [x] T-21 Sync completa/incremental, `SyncRun`, "Sincronizar ahora" vía `Setting`, pantalla Ajustes > OCS (RF-08).
- [x] T-22 Limpieza de sesiones colgadas (RF-11 CA-3).

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
- [x] T-43 Modelo: `ComputerScreen`, `monitorCount` y campos nuevos de `RemoteSession` (02) + migración + seed con 4 equipos de 2 pantallas y 1 de 3.
- [x] T-44 Mapper OCS (`monitorCount`) y `shared/screens.ts` (puertos, validación, `deriveMultiState`) + T-U11.
- [x] T-45 Worker: descubrimiento y sondeo por pantalla (09 §3) + T-I4; API de pantallas (`GET/PUT /screens`, `/discover`) y pestaña "Pantallas" en la ficha (RF-15 CA-1/2).
- [x] T-46 API de sesiones y gateway con `targetPort`, `groupId`, y conflicto solo con otros usuarios + T-I2 (g) (RF-15 CA-7).
- [x] T-47 Visor: botón dividido, ventanas separadas, mosaico, "Desconectar todas", respaldo ante popups bloqueados, enlaces nativos por pantalla y nota de limitación en `/ayuda/tightvnc` (RF-15 CA-3…CA-6, CA-9).
- [x] T-48 Filtro y KPI "multipantalla pendiente de configurar" e icono ▭▭ en listado y mapa (RF-15 CA-8).
- [ ] T-49 Con el resultado del piloto: `extras/tightvnc-multimonitor/configurar-pantallas.ps1` (idempotente: puertos extra, regla de firewall, reinicio del servicio `tvnserver`) y guía de despliegue por GPO en `docs/operacion.md`.

## F6 — Cierre v1
- [x] T-33 Dashboard con KPIs y buscador global `Ctrl+K` (RF-12, 06 §1).
- [x] T-34 Cabeceras de seguridad/CSP (RNF-SEC-8), logs JSON (RNF-OPS-4).
- [x] T-35 Dockerfile multi-target, `docker-compose.yml`, healthchecks; `docker compose up` local funcional con seed (07).
- [x] T-36 Playwright smoke T-E1.
- [x] T-37 `docs/operacion.md`: despliegue, NPM, firewall/GPO, copias, rotación de secretos (07 §5-8); scripts `smoke.ps1`/`smoke.sh`.
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
- [x] T-56 Asistente `/importar/carga-inicial` pasos 1, 2 y 4 (RF-16).
- [x] T-57 Mapa: despacho automático al soltar (RF-04 CA-6), capa de despachos, tooltip, etiqueta configurable, filtro de departamento (CA-10…13).
- [x] T-58 Fixtures `fixtures/carga-ayto/` y pruebas de aceptación T-I5 (+ T-E2 opcional).
- [x] T-59 Directorio: importación, autocompletado, sugerencias, ficha, búsqueda; paso 3 del asistente (RF-17).
- [x] T-60 Listado/ficha/mapa: columna y filtro de usuario, icono de discrepancia, parámetro `check` (RF-02/03).
- [x] T-61 `/calidad`, `/api/quality`, export CSV y enlace desde el dashboard (RF-18).
- [x] T-62 Identidad del equipo: resolución DNS en el gateway, `desktopname` en el visor, endpoint e iconos (RF-19) + T-I6.
- [ ] T-63 `[STOP]` Carga real: el humano importa estructura, planos y equipos reales y valida con la checklist de §13; el agente anota hallazgos en `docs/progress.md`.
- [ ] T-64 (P2, solo si se pide) Importar `ad-equipos.csv` como fuente secundaria de hostname/IP.

## F9 — CR-02: GLPI como fuente de verdad (specs/11; **prevalece sobre 00–10**)
Orden: T-70 `[STOP]` → P0 → P1. P2 solo si se pide. Antes de empezar: el humano commitea el árbol actual.
- [x] T-69 Reconciliación y ADR-008 (ya redactada): tabla en `docs/progress.md` (tarea previa · estado · delta); actualizar `AGENTS.md` §1/§2/§7 y marcar T-20, T-41 y T-63 como sustituidas.
- [x] T-70 `[STOP]` Pedir al humano los JSON reales de GLPI (specs/11 §5.7): equipo, search options, lugares. Anonimizar en `apps/worker/test/fixtures/glpi-*.json`. Hasta entonces, `glpi-computer.sample.json` propio.
- [x] T-71 Modelo (§4): migración aditiva `cr02_glpi` (`glpiId`, `glpiLocationId`, `lastInventoryAt`, enums `GLPI`), `.env.example` (§5.1) y `docker-compose.yml` (variables por servicio + `extra_hosts` a la IP privada de GLPI si procede).
- [x] T-72 Cliente GLPI del worker (§5.3), reutilizando el diseño de `glpi-incidencias-movil/lib/glpi/client.ts` + T-U22.
- [x] T-73 `mapGlpiComputer`/`mergeGlpiComputer` + T-U20/T-U21 y sync de equipos con barrido nocturno, archivado por papelera, `SyncRun` GLPI y modo sombra (§5.4, RF-20) + T-I7.
- [x] T-74 Lugares → Edificio/Planta/Despacho (§5.5) + T-U23; usuarios → `DirectoryUser` y `adUsername` (§5.6).
- [ ] T-75 UI solo lectura (RF-21): etiquetas «GLPI», «Abrir en GLPI», `/ajustes` con estado/probar/sincronizar, lista blanca de PATCH reducida + T-I8; ocultar flujos legados tras `LEGACY_IMPORT_ENABLED`.
- [ ] T-83 (P1) Rediseño visual al estilo GLPI (specs/11 §12, referencia `docs/referencia-visual/glpi-panel-central.png`): tokens de color muestreados, sidebar teal plegable, barra superior, componente `KpiTile`, donuts/barras en SVG propio y nuevo dashboard. Hacerlo tras T-75 y antes del corte (T-80).
- [x] T-76 Enlace de vuelta `/equipos/glpi/[id]` y `?name=` + campo motivo con nº de ticket (RF-22) + T-I9; guía del Enlace Externo en `docs/operacion.md`.
- [x] T-77 `posiciones.csv` (RF-23) + bandeja «Sin colocar» en el mapa + T-I11.
- [x] T-78 Calidad redefinida (RF-24) con enlaces «Corregir en GLPI».
- [ ] T-79 (P1, **tras 2 semanas estables**, con confirmación) Retirar sync OCS, mapper, importaciones/asistente legados y columnas `ocs*` (migración destructiva ⇒ backup `pg_dump` primero).
- [ ] T-80 `[STOP]` Corte (specs/11 §9): modo sombra con GLPI real, validar informe, activar sync, colocar puestos, probar asistencia remota; el agente anota hallazgos en `docs/progress.md`.
- [ ] T-81 (P1) Escritura de ubicación a GLPI con flag (RF-25) + T-I10.
- [ ] T-82 (P2, solo si se pide) Seguimiento en el ticket al cerrar sesión (RF-26); departamentos desde Grupos; «TightVNC instalado» desde software de GLPI.
