# AGENTS.md — Reglas para el agente programador

## 1. Principios SDD

1. `specs/` es la **fuente de verdad**. No implementes nada que no esté especificado.
2. Si una spec es ambigua o contradictoria: elige la opción más simple que cumpla los criterios
   de aceptación, y regístralo como decisión en `docs/decisions.md` (formato ADR corto:
   contexto, decisión, consecuencias). No te detengas a preguntar salvo en los puntos `[STOP]`.
3. Si descubres que una spec es técnicamente inviable (p. ej. una librería no funciona como se
   esperaba), documenta en `docs/decisions.md` la alternativa elegida y actualiza la spec afectada
   en el mismo commit.
4. Cada tarea de `tasks.md` referencia los requisitos (`RF-xx`, `RNF-xx`) que cubre. Al terminar
   la tarea, sus criterios de aceptación deben cumplirse.

## 2. Bucle agéntico (obligatorio)

Repite hasta completar `tasks.md`:

1. Toma la **primera tarea sin marcar** de `tasks.md`.
2. Relee las secciones de spec que referencia.
3. Implementa el **mínimo** necesario para cumplir sus criterios.
4. Ejecuta la verificación: `npm run verify` (lint + typecheck + tests).
5. Si falla, corrige. Máximo **3 intentos** por tarea; si sigue fallando, anota el bloqueo en
   `docs/blockers.md` (qué falla, qué probaste, hipótesis) y pasa a la siguiente tarea que no
   dependa de ella.
6. Marca la tarea `[x]` en `tasks.md` y haz commit con Conventional Commits:
   `feat(T-12): sondeo RFB del puerto 5900`.
7. Al cerrar cada fase, actualiza `docs/progress.md`.

## 3. Puntos de parada `[STOP]`

Detente y pide intervención humana solo cuando:
- Necesites credenciales reales (OCS, contraseña VNC) o acceso a la red municipal.
  Mientras tanto, trabaja con **fixtures y mocks**; nunca inventes credenciales.
- Vayas a ejecutar algo destructivo fuera del repositorio.
- Una tarea marcada `[STOP]` en `tasks.md` lo requiera.

## 4. Entorno

- Host de desarrollo: **Windows + PowerShell**. Los scripts de `package.json` deben ser
  multiplataforma: usa `rimraf`, `cross-env` o scripts Node; nada de `rm -rf`, `cp`, `sed`, `export`.
- Dentro de los `Dockerfile` (imágenes Linux) puedes usar shell POSIX.
- Base de datos local para desarrollo: `docker compose -f docker-compose.dev.yml up -d db`.

## 5. Stack y estructura (no cambiar sin ADR)

Monorepo con **npm workspaces**:

```
/apps/web        Next.js (App Router, TypeScript) — UI + API (route handlers)
/apps/gateway    Node.js + ws — proxy WebSocket ↔ TCP (RFB) con tokens de un solo uso
/apps/worker     Node.js — sincronización OCS, sondeo de red, tareas programadas
/packages/db     Prisma (schema, migraciones, cliente, seed)
/packages/shared Tipos, zod schemas, utilidades puras (tokens, cifrado, CIDR, RFB, estado VNC)
/docs            decisions.md, blockers.md, progress.md, operacion.md
/extras          Ficheros para los PCs de los técnicos
```

Versiones: última estable de Next.js (≥ 15), React 19, Prisma (última estable), PostgreSQL 17,
Node 22 LTS. Fija versiones exactas en `package.json` (sin `^`).

Librerías acordadas: `next-auth` v5 (Credentials) + `bcryptjs`, `zod`, `jose` (JWT),
`@novnc/novnc`, `leaflet` + `react-leaflet`, `ws`, `node-cron`, `p-limit`, `papaparse`,
`image-size`, Tailwind CSS + shadcn/ui, `@tanstack/react-table`, `vitest`, `@playwright/test`.
No añadas otras dependencias relevantes sin ADR.

## 6. Estándares de código

- TypeScript `strict`, sin `any` explícito. Validación de toda entrada con zod.
- Todo route handler y server action comprueba sesión y rol **antes** de tocar datos.
- Nunca guardes contraseñas VNC en claro: AES-256-GCM con `VNC_ENC_KEY` (ver `packages/shared/crypto`).
- Nada de secretos en el código ni en logs. Mantén `.env.example` actualizado.
- Lógica pura (decisiones, parsers, mappers) en `packages/shared` o módulos sin efectos para
  poder testearla sin red ni base de datos.
- Textos de la UI en español. Fechas en zona `Europe/Madrid`.

## 7. Scripts npm obligatorios (raíz)

| Script | Qué hace |
|---|---|
| `dev` | Arranca web, gateway y worker en modo desarrollo |
| `lint` | ESLint en todos los workspaces |
| `typecheck` | `tsc --noEmit` en todos los workspaces |
| `test` | Vitest (unitarios + integración sin red externa) |
| `test:e2e` | Playwright (smoke) |
| `verify` | `lint` + `typecheck` + `test` |
| `db:migrate` / `db:seed` | Prisma migrate dev / seed |

## 8. Qué NO hacer

- No sustituir TightVNC ni instalar agentes nuevos en los puestos.
- No exponer el puerto 5900 de los puestos ni a internet ni al navegador directamente.
- No pasar la contraseña VNC por URL ni guardarla en `localStorage`.
- No añadir funcionalidades fuera de alcance (`specs/00-vision.md` §5).
