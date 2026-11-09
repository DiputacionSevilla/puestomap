# AGENTS.md — Guía del agente programador (PuestoMap)

Punto de entrada único de conocimiento del proyecto. Léelo **antes** de tocar código.
Las reglas de ejecución SDD (bucle de tareas, `[STOP]`, formato de commits) están en
`puestomap-sdd/AGENTS.md` y también aplican.

## 1. Qué es y en qué estado está

Panel interno del Ayuntamiento de Mairena del Alcor para **inventariar puestos de trabajo**
(edificios/plantas/despachos/planos/ubicaciones en mapa) y prestar **asistencia remota**
(visor noVNC en el navegador + lanzador nativo TightVNC), con inventario sincronizado desde GLPI (CR-02; OCS en retirada).

- Metodología SDD: `puestomap-sdd/specs/` es la fuente de verdad; `puestomap-sdd/tasks.md` es el
  plan; `docs/` guarda decisiones, progreso, bloqueos y operación.
- Estado (2026-11-09): fases F0–F8 **completadas** salvo las tareas `[STOP]`/opcionales de §7.
  `npm run verify` en verde (lint + typecheck + **100 tests**); asistencia remota validada en
  navegador real (Chromium) tanto en dev (`:3000`) como en Docker (`:3100`).
- ⚠ El repositorio tiene **~71 ficheros sin commitear** (cambios de las últimas sesiones).
  No hagas commit/push salvo que el usuario lo pida expresamente.

> ⚠ **CR-02 (2026-11-09): cambio de alcance vigente.** GLPI pasa a ser la fuente de verdad del
> inventario y PuestoMap queda como consola de asistencia remota + plano. Lee
> `puestomap-sdd/specs/11-integracion-glpi.md` y la fase **F9** de `tasks.md` **antes** de tocar
> importaciones, OCS, estructura física o usuarios. Prevalece sobre §7 y sobre specs 00–10.

## 2. Mapa del conocimiento

| Fichero | Qué contiene |
|---|---|
| `puestomap-sdd/AGENTS.md` | Reglas SDD obligatorias (bucle agéntico, `[STOP]`, estándares, librerías acordadas) |
| `puestomap-sdd/specs/00…09` | Requisitos por área. `specs/10` = **CR-01** (carga de ubicaciones/planos/usuarios); donde contradiga a 02–09, **prevalece** |
| `puestomap-sdd/specs/11` | **CR-02**: GLPI como fuente de verdad (prevalece sobre 00–10) |
| `puestomap-sdd/tasks.md` | Plan de ejecución con estado `[x]`/`[ ]` y `[STOP]` |
| `docs/decisions.md` | ADR-000…ADR-007 (ubicación del SDD, ESM, Prisma 6.19, Tailwind 3, noVNC estático, CR-01, decisiones menores) |
| `docs/progress.md` | Estado por fase, verificación y pendientes |
| `docs/blockers.md` | Bloqueos (actualmente ninguno activo) |
| `docs/operacion.md` | Despliegue en docker1, Nginx Proxy Manager, firewall/GPO, backups, rotación de secretos |
| `AGENTS.md` (este) | Mapa del repo, entornos, arquitectura operativa, invariantes y checklist de revisión |

## 3. Estructura del monorepo (npm workspaces)

```
apps/web        Next.js (App Router, TS) — UI + route handlers (/api/*). Puerto dev 3000
apps/gateway    Node + ws — proxy WebSocket↔TCP (RFB) con JWT un solo uso. Puerto dev 8081
apps/worker     Node — sync GLPI (y OCS hasta T-79), sondeo de red, cron, health en puerto 8082 (sin publicar en prod)
packages/db     Prisma (schema, migraciones, seed, cliente @puestomap/db)
packages/shared Tipos, zod, lógica pura (crypto, token, cidr, rfb, vnc-status, csv…) — @puestomap/shared
scripts/        dev.mjs, gen-secrets.mjs, smoke.*, e2e-browser/
puestomap-sdd/  specs + tasks.md + AGENTS.md (fuente de verdad SDD)
docs/           decisions / progress / blockers / operacion
extras/         ficheros para los PCs de los técnicos (tightvnc-launch.ps1…)
```

Versiones fijas sin `^`: Next ≥15 (usando 16), React 19, Prisma **6.19.x** (ADR-003), PostgreSQL 17,
Node ≥22 (imágenes `node:22-alpine`). Paquetes **ESM** (`nodenext`): los imports relativos llevan
extensión `.js` (ADR-001). `npm run typecheck` compila antes `packages/*` a `dist`.

## 4. Entornos y comandos

Hay **dos stacks locales** y no comparten base de datos:

| | Desarrollo | Docker (pruebas finas / "prod" local) |
|---|---|---|
| Compose | `docker-compose.dev.yml` (proyecto `puestomap`) | `docker-compose.yml` (proyecto `puestomap-prod`) |
| Web | `http://localhost:3000` | `http://localhost:3100` |
| Gateway | `ws://localhost:8081` | `ws://localhost:8181` |
| Worker | `8082` vía `npm run dev` | `8082` sin puerto publicado |
| DB | `127.0.0.1:5432` publicado | solo dentro de Compose |

### 4.1 Desarrollo

```powershell
docker compose -f docker-compose.dev.yml up -d db   # solo la BD
npm run dev                                          # web + gateway + worker (scripts/dev.mjs)
```

### 4.2 Docker local

```powershell
docker compose up -d --build
docker compose ps            # db, web, gateway, worker → healthy
docker compose logs -f web gateway worker
docker compose exec -T db psql -U puestomap -d puestomap   # consola SQL
```

- ⚠ **Reconstruir la imagen al cambiar código**: `docker compose up -d` **no** recompila.
  Tras tocar `apps/web` hace falta `docker compose build web` (o `--build`) y luego `up -d`.
  Síntoma típico de imagen desactualizada: errores viejos que ya están corregidos en el código.
- El proyecto **no** está en el CPD 10.158.0.3; el despliegue real es docker1 según
  `docs/operacion.md`.

### 4.3 Credenciales

- El usuario `admin` y su contraseña los define **el usuario** (no están en el repositorio;
  preguntar si hacen falta). Cambio puntual: `UPDATE "User" SET "passwordHash"=…` con hash
  bcrypt (coste 12) o reutilizar el flujo de seed controlado. **Nunca** escribas contraseñas ni
  valores de `.env` en el código ni en la documentación.
- `.env` (raíz) alimenta ambos stacks vía interpolación de Compose; `.env.example` documenta
  solo **nombres** de variables. Secretos con `npm run gen:secrets`.

### 4.4 Verificación

```powershell
npm run verify       # lint + typecheck + vitest (debe estar en verde; ~100 tests)
npm run test:e2e     # Playwright smoke (T-E1)
npm run smoke        # smoke HTTP (scripts/smoke.mjs); o scripts/smoke.ps1
node scripts/e2e-browser/check-remote.mjs   # E2E de asistencia remota (ver su README)
```

## 5. Asistencia remota — arquitectura operativa (lo más delicado)

Flujo de una sesión WEB:

1. `POST /api/computers/[id]/sessions` (`apps/web/app/api/computers/[id]/sessions/route.ts`):
   valida sesión/rol, toma el lock de concurrencia, crea `RemoteSession` (límite **4 simultáneas**
   por usuario) y devuelve `wsUrl` (apuntando a `GATEWAY_PUBLIC_URL`) y `url` nativa
   `tightvnc://ip:puerto`.
2. El visor (`/remote/[id]`, `apps/web/components/remote/rfb-viewer.tsx`) abre un `WebSocket`
   hacia el gateway con un **token JWT de un solo uso**.
3. `apps/gateway/src/index.ts` valida: `Origin === APP_URL` **estricto**, JWT, `ALLOWED_CIDRS`
   (IP destino) y `VNC_ALLOWED_PORTS`; después conecta TCP/RFB al puesto
   (`apps/gateway/src/gateway.ts`) y hace de relay.
4. Códigos de cierre del gateway → mensajes de UI: 4401/4403/4409/4502 (ver `specs/06` §5).

### Invariantes — no romper

- **Origen estricto**: el `APP_URL` *del gateway* debe ser exactamente la URL desde la que
  navega el navegador. En Docker eso se configura con `COMPOSE_APP_URL`
  (=`http://localhost:3100` en local), **no** con `APP_URL` (que es la del entorno dev, `:3000`).
- **Variables dedicadas del Compose**: `docker-compose.yml` usa `COMPOSE_APP_URL` y
  `COMPOSE_GATEWAY_PUBLIC_URL` (web y gateway). `COMPOSE_GATEWAY_PUBLIC_URL` =
  `ws://localhost:8181` en local; **vacío** solo detrás de un proxy con `location /vnc-ws`
  (Nginx, ver `docs/operacion.md`).
- **`apps/web/proxy.ts` NO reenvía `/vnc-ws`**: por eso en local el navegador debe hablar
  directamente con el gateway; no quitar `GATEWAY_PUBLIC_URL` sin proxy delante.
- **Lock de sesiones**: la query debe ser
  `SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(<id>))`. Sin el `SELECT 1 AS` Prisma
  recibe tipo `void` y la creación de sesión devuelve **500** (bug ya vivido: la imagen Docker
  se quedó desactualizada y falló en producción local).
- **Visor noVNC**: `instrumentWebSocket()` envuelve `window.WebSocket` con un **constructor
  proxy** y `Object.setPrototypeOf(TrackedWebSocket, Original)` (noVNC 1.7 inspecciona solo el
  prototipo inmediato al hacer `new WebSocket()`; romperlo deja el visor en «conectando»).
- **URL nativa**: formato `tightvnc://host:puerto` con **un solo `:``
  (`extras/tightvnc-protocol/tightvnc-launch.ps1` rechaza `::`).
- **Contraseña VNC**: cifrada AES-256-GCM (`VNC_ENC_KEY`); nunca por URL ni en `localStorage`.

## 6. Reglas de diseño que no romper

- **No hay borrado físico en la UI**: por diseño solo se **archiva** (auditoría/traceabilidad).
  Si hay que purgar datos de prueba, es SQL directo con **orden de claves ajenas**:
  `RemoteSession → AuditLog → SyncRun → Computer` (borra `ComputerScreen` en cascada)
  `→ Office → Floor → Building → Department`. **Backup primero**:
  `docker compose exec -T db pg_dump -U puestomap -d puestomap -Fc > copia.dump`.
  (Limpieza real aplicada el 2026-11-09 en el stack Docker: 0 equipos, se conservaron usuario
  `admin` y credencial VNC.)
- **Seed opt-in**: `SEED_ON_START` por defecto `false` en Compose; activarlo solo en el primer
  arranque controlado. Ejecución manual: `npm run db:seed`.
- **Variables por servicio** en Compose (sin `env_file` global).
- **Seguridad**: toda ruta comprueba sesión/rol (`requireRole()`) *antes* de tocar datos;
  entradas validadas con zod; sin secretos en código ni logs; exportaciones CSV pasan por
  `sanitizeCsvCell` (anti inyección de fórmulas); datos de directorio ocultos a `VIEWER`.
- **UI en español**, fechas en `Europe/Madrid`. Librerías solo de la lista acordada (SDD §5);
  cualquier adición necesita ADR.
- El visor expone la contraseña VNC al técnico autenticado en la respuesta HTTPS (spec 01 §3);
  F7 (auth VNC en el gateway) está pendiente como mejora.

## 7. Estado de tareas y pendientes

- Completadas: F0–F8 salvo puntos que requieren intervención humana:
  - `T-20` sustituida por CR-02 (inventario desde GLPI).
  - `T-42/T-49 [STOP]` piloto multipantalla en PC de doble monitor.
  - `T-38 [STOP]` checklist de aceptación con red real.
  - `T-63 [STOP]` carga real (CR-01) con checklist de `specs/10` §13.
  - Opcionales: `T-27` editor de rectángulos de despacho, `T-64` (no solicitado).
- El usuario va a cargar el **CSV real de equipos** por `Importar → Carga inicial`
  (fixtures de ejemplo en `apps/web/test/fixtures/carga-ayto/`; los CSV reales no se versionan).

## 8. Checklist de revisión (agente revisor)

1. `npm run verify` en verde; si no, diagnosticar antes de proponer cambios.
2. Leer `puestomap-sdd/AGENTS.md` + `docs/decisions.md`; comprobar que el código cumple los
   ADR (ESM `.js`, Prisma 6.19, noVNC estático, CR-01 con precedencia).
3. Contrastar specs ↔ código en los puntos críticos:
   - creación de sesiones y límite de 4 (`sessions/route.ts`);
   - origen/JWT/CIDR del gateway (`apps/gateway/src/index.ts`);
   - visor y envoltorio WebSocket (`rfb-viewer.tsx`);
   - `proxy.ts` y variables `COMPOSE_*` del Compose;
   - auditoría y roles en todos los route handlers.
4. Seguridad: no secretos ni passwords en repo/docs; `.env.example` solo con nombres;
   validación zod en toda entrada; CSV exportados sanitizados.
5. Coherencia de docs: `progress.md`, `tasks.md` y este fichero reflejan el estado real
   (fechas, nº de tests, pendientes).
6. Tras cambiar código de `apps/web`, recordar **reconstruir la imagen Docker** si se va a
   verificar en `:3100`.
7. No commitear sin petición explícita del usuario.

## 9. Convenciones de entrega

- Commits Conventional Commits cuando se pida: `feat(T-12): …`, `fix(remote): …`.
- Al cerrar una fase o sesión importante: actualizar `docs/progress.md` y, si hubo una decisión
  técnica, añadir ADR en `docs/decisions.md` (contexto / decisión / consecuencias).
- Bloqueos nuevos → `docs/blockers.md` (qué falla, qué se probó, hipótesis).
