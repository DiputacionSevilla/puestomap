# Progreso

Ejecución de `puestomap-sdd/tasks.md`. Última actualización: 2026-11-09 (sesión one-shot y
post-fases; ver «Actualizaciones posteriores» al final).

| Fase | Estado | Notas |
|---|---|---|
| F0 Base del proyecto | completada | Monorepo npm workspaces, Next.js 16 + Tailwind 3, compose dev, docs |
| F1 Datos, seguridad y utilidades | completada | Prisma 6.19 (ADR-003), seed DM-8, shared + tests T-U1…T-U7, auth + roles, auditoría |
| F2 Inventario y estructura | completada | APIs completas, planos, equipos UI, ficha, credenciales/usuarios, CSV |
| F3 Worker: OCS y sondeo | completada salvo STOP | T-17, T-18, T-19, T-21 y T-22 completadas; T-20 espera el JSON real de OCS |
| F4 Mapa | completada | T-23…T-26; T-27 parcial (asignación automática de despacho sí, editor de rectángulos no) |
| F5 Asistencia remota | completada | Gateway WS↔RFB (T-I2 en verde), visor noVNC, modo nativo, sesiones, auditoría |
| F5b Multipantalla | completada salvo piloto | T-43…T-48 completadas; T-42 sigue en `[STOP]` y T-49 espera el resultado del piloto |
| F6 Cierre v1 | completada salvo STOP | T-33…T-37 completadas; T-38 requiere aceptación manual en red real |
| F8 CR-01 (specs/10) | completada salvo STOP/opcional | T-50…T-62 completadas; T-63 espera carga real y T-64 no se ha solicitado |
| F9 CR-02 GLPI (specs/11) | completada salvo STOP/pendientes | T-69…T-78, T-81 y T-83 hechas; T-79 hecha en lo relativo a OCS (código, columnas, env); quedan los importadores heredados tras `LEGACY_IMPORT_ENABLED`; T-80 [STOP] (corte) pendiente; T-82 (P2) no solicitada |

### Reconciliación CR-02 (T-69)
| Tarea previa | Estado | Delta por CR-02 |
|---|---|---|
| T-20 (JSON real de OCS) | sustituida | El inventario viene de GLPI; fixtures `glpi-*.json` (T-70). OCS se retira en T-79 |
| T-41 (importaciones de inventario) | sustituida | GLPI es la fuente; importadores CSV/OCS quedan tras `LEGACY_IMPORT_ENABLED` |
| T-63 (carga real de ubicaciones/equipos) | sustituida | Lugares y equipos llegan por sync; solo posiciones se cargan (T-77) |
| T-19/T-21/T-22 (mapper y sync OCS) | retiradas (T-79) | Código, tests, variables `OCS_*` y columnas `ocsId`/`ocsLastInventory` eliminados; los valores `OCS` de los enums se conservan por las filas históricas |

## Verificación
- `npm run verify` en verde (ESLint + typecheck de todos los workspaces + **141 tests**).
- Asistencia remota validada en navegador real (Chromium + servidor RFB falso): el visor alcanza
  `conectado` (corregido el envoltorio de `window.WebSocket` que rompía las constantes y el
  prototipo que inspecciona noVNC) y el modo nativo devuelve `tightvnc://ip:puerto` con un solo
  `:` (el lanzador rechazaba `::`).
- T-35: `docker compose up -d --build` completado con migraciones y seed; `db`, `web`, `gateway` y
  `worker` quedan `healthy`. HTTP real devuelve 200 en web y gateway, y `scripts/smoke.ps1` pasa.
- `npm run test:e2e` (T-E1) en verde; `npm run smoke` en verde con datos del seed.
- Revisión de seguridad aplicada: seed desactivado por defecto en Compose, variables por servicio
  (sin `env_file` global), datos de directorio ocultos a `VIEWER`, validación zod del import de
  directorio, neutralización de fórmulas en exportaciones CSV y bloqueo `pg_advisory_xact_lock`
  para el límite de 4 sesiones simultáneas.

## Decisiones tomadas (detalle en docs/decisions.md)
- ADR-000 ubicación del pack SDD · ADR-001 módulos ESM · ADR-003 Prisma 6.19 · ADR-004 Tailwind 3 +
  primitivas shadcn · ADR-005 noVNC estático · ADR-006 CR-01 incorporado · ADR-007 decisiones menores
  (incluye el secreto de auth en el proxy: el bundle de `proxy.ts` no expone `process.env`, se lee del
  `.env` con `lib/env-file.ts`).

## Pendientes que requieren intervención humana ([STOP])
- **T-20**: JSON real de OCS para validar el mapper (`specs/05-integraciones.md` §1.1). Mientras tanto
  el mapper T-19 está implementado y probado contra `ocs-computer.sample.json`.
- **T-42**: piloto de multipantalla en un PC con doble monitor (`specs/09-multipantalla.md` §7).
- **T-38**: checklist de aceptación manual con red real (`specs/08-tests.md` §5).
- **T-63**: carga real de ubicaciones/planos/equipos con la checklist de `specs/10` §13.

## Tareas restantes (orden recomendado)
1. **T-20 [STOP]**: validar el mapper de F3 con un JSON real anonimizado de OCS.
2. **T-42/T-49**: ejecutar el piloto multipantalla y, solo con su resultado, generar la automatización.
3. **CR-01 T-63 [STOP]**: realizar la carga real y validar la checklist de `specs/10` §13.
4. T-27 (opcional): editor de rectángulos de despacho sobre el plano.

## Notas de implementación
- El visor remoto instrumenta `window.WebSocket` para leer el código de cierre del gateway y mostrar
  los mensajes de `specs/06` §5.
- `npm run dev` (raíz) arranca web + gateway + worker con el `.env` de la raíz cargado
  (`scripts/dev.mjs`); el worker programa sondeos, sync OCS, limpieza de sesiones y expone `/health`
  en el puerto 8082.
- Los endpoints de sesión WEB exponen la contraseña VNC solo al técnico autenticado en la respuesta
  HTTPS (spec 01 §3); F7 (auth VNC en el gateway) evitaría que llegue al navegador.

## Actualizaciones posteriores (2026-11-09, tras el cierre de fases)

- **Asistencia remota validada de extremo a extremo en navegador real** (Chromium + servidor RFB
  falso), en dev (`:3000`) y en Docker (`:3100`), alcanzando el estado `conectado`. Correcciones:
  - `instrumentWebSocket()` con constructor proxy + `Object.setPrototypeOf` (noVNC 1.7 inspecciona
    el prototipo inmediato; sin esto el visor se queda en «conectando»).
  - URL nativa `tightvnc://host:puerto` con **un solo `:`** (el lanzador rechazaba `::`).
  - Lock de sesiones con `SELECT 1 AS locked FROM pg_advisory_xact_lock(...)` (sin `SELECT 1 AS`
    el tipo `void` rompe Prisma y la creación de sesión devuelve 500).
- **Entorno Docker corregido**: se reintrodujeron `COMPOSE_APP_URL` / `COMPOSE_GATEWAY_PUBLIC_URL`
  en `docker-compose.yml`, `.env` y `.env.example` (el Compose interpolaba `APP_URL`/`GATEWAY_PUBLIC_URL`
  del entorno dev y el gateway rechazaba el `Origin` de `:3100`). Imagen `web` reconstruida para
  incluir el fix del advisory lock; los cuatro servicios `healthy`.
- **Revisión de seguridad aplicada** (ya reflejada arriba): seed opt-in (`SEED_ON_START=false`),
  variables por servicio, datos de directorio ocultos a `VIEWER`, zod en el import de directorio,
  `sanitizeCsvCell` en exportaciones CSV, backup de `uploads` corregido en `operacion.md`.
- **Limpieza de datos de prueba en Docker** (previa a la carga real del usuario): backup
  `pg_dump -Fc` y borrado en orden de claves ajenas (`RemoteSession → AuditLog → SyncRun →
  Computer → Office → Floor → Building → Department`) + planos SVG de seed; se conservaron el
  usuario `admin` y la credencial VNC. BD Docker con **0 equipos**, lista para `Importar`.
- **Conocimiento consolidado**: nuevo `AGENTS.md` en la raíz (mapa del conocimiento, entornos,
  arquitectura de la asistencia remota e invariantes, checklist de revisión), `CLAUDE.md` que
  apunta a él y utilidad E2E versionada en `scripts/e2e-browser/check-remote.mjs` (contraseña
  solo por variable de entorno).
