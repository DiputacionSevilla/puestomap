# Progreso

Ejecución de `puestomap-sdd/tasks.md`. Última actualización: 2026-11-09 (sesión one-shot).

| Fase | Estado | Notas |
|---|---|---|
| F0 Base del proyecto | completada | Monorepo npm workspaces, Next.js 16 + Tailwind 3, compose dev, docs |
| F1 Datos, seguridad y utilidades | completada | Prisma 6.19 (ADR-003), seed DM-8, shared + tests T-U1…T-U7, auth + roles, auditoría |
| F2 Inventario y estructura | completada | APIs completas, planos, equipos UI, ficha, credenciales/usuarios, CSV |
| F3 Worker: OCS y sondeo | **pendiente** | T-17…T-22 (probe compartido ya existe y se usa en la web) |
| F4 Mapa | completada | T-23…T-26; T-27 parcial (asignación automática de despacho sí, editor de rectángulos no) |
| F5 Asistencia remota | completada | Gateway WS↔RFB (T-I2 en verde), visor noVNC, modo nativo, sesiones, auditoría |
| F5b Multipantalla | **pendiente** | T-43…T-48 (el modelo ya incluye `ComputerScreen`; falta UI/worker) |
| F6 Cierre v1 | parcial | Dashboard (T-33) hecho; faltan CSP completa (T-34), Docker (T-35), Playwright (T-36), operación (T-37) |
| F8 CR-01 (specs/10) | parcial | Hechos T-50…T-57, T-62; faltan T-58 (fixtures), T-59 (directorio), T-60 (columnas listado), T-61 (/calidad) |

## Verificación
- `npm run verify` en verde: ESLint + tsc + **84 tests** (T-U1…T-U7, T-U10/T-U10+, T-U11…T-U15, T-I1, T-I2 + identidad).
- `npm run smoke` (scripts/smoke.mjs): health, login, `/`, `/equipos`, `/mapa`, `/estructura`,
  `/ajustes`, `/api/computers`, `/api/stats` — todo 200 con datos del seed.

## Decisiones tomadas (detalle en docs/decisions.md)
- ADR-000 ubicación del pack SDD · ADR-001 módulos ESM · ADR-003 Prisma 6.19 · ADR-004 Tailwind 3 +
  primitivas shadcn · ADR-005 noVNC estático · ADR-006 CR-01 incorporado · ADR-007 decisiones menores
  (incluye el secreto de auth en el proxy: el bundle de `proxy.ts` no expone `process.env`, se lee del
  `.env` con `lib/env-file.ts`).

## Pendientes que requieren intervención humana ([STOP])
- **T-20**: JSON real de OCS para validar el mapper (`specs/05-integraciones.md` §1.1). Mientras tanto
  hay que implementar el mapper (T-19) contra un fixture sintético.
- **T-42**: piloto de multipantalla en un PC con doble monitor (`specs/09-multipantalla.md` §7).
- **T-38**: checklist de aceptación manual con red real (`specs/08-tests.md` §5).
- **T-63**: carga real de ubicaciones/planos/equipos con la checklist de `specs/10` §13.

## Tareas restantes (orden recomendado)
1. **F3 (T-17…T-22)**: `probeComputer` ya está en shared y se usa desde la web; falta el worker
   (node-cron + p-limit), el cliente/mapper OCS (T-19, plegar `lastUserNorm`) y la limpieza de sesiones.
2. **F5b (T-43…T-48)**: UI de pantallas, descubrimiento en worker, botón dividido y mosaico.
3. **CR-01 P0 restante**: T-58 fixtures `fixtures/carga-ayto/` + T-I5.
4. **CR-01 P1**: T-59 directorio (importación `ad-usuarios.csv`, autocompletado, sugerencias),
   T-60 columnas de usuario en listado/ficha/mapa, T-61 `/calidad` + `/api/quality`.
5. **F6 restante**: T-34 CSP completa, T-35 Dockerfile multi-target + compose, T-36 Playwright T-E1,
   T-37 `docs/operacion.md` + `smoke.sh`.
6. T-27 (opcional): editor de rectángulos de despacho sobre el plano.

## Notas de implementación
- El visor remoto instrumenta `window.WebSocket` para leer el código de cierre del gateway y mostrar
  los mensajes de `specs/06` §5.
- `npm run dev` (raíz) arranca web + gateway + worker con el `.env` de la raíz cargado
  (`scripts/dev.mjs`); el worker aún es un placeholder (F3 pendiente).
- Los endpoints de sesión WEB exponen la contraseña VNC solo al técnico autenticado en la respuesta
  HTTPS (spec 01 §3); F7 (auth VNC en el gateway) evitaría que llegue al navegador.
