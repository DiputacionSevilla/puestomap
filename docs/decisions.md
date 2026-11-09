# Decisiones (ADR cortos)

Formato: contexto / decisión / consecuencias.

## ADR-000 — Ubicación del código y del pack SDD
- **Contexto**: el pack SDD llega en `puestomap-sdd/` (AGENTS.md, specs/, tasks.md, extras/) dentro
  de la carpeta del proyecto. El README del pack sugiere copiar su contenido a la raíz.
- **Decisión**: el monorepo se crea en la raíz del proyecto y `puestomap-sdd/` se conserva **sin
  duplicar** como única fuente de verdad de specs y tasks (se marcan las tareas ahí). `docs/` de la
  aplicación vive en la raíz.
- **Consecuencias**: una sola copia de las specs; los agentes futuros leen `puestomap-sdd/`.

## ADR-001 — Resolución de módulos entre paquetes
- **Contexto**: npm workspaces con TypeScript estricto; hay que compilar `packages/shared` y
  `packages/db` para producción (Docker) pero los tests deben correr sin build.
- **Decisión**: los paquetes son **ESM** (`"type": "module"`, `module/moduleResolution: nodenext`),
  compilan a `dist` con declaraciones y se consumen por nombre (`@puestomap/shared`,
  `@puestomap/db`). `npm run typecheck` compila antes las librerías; Vitest resuelve los paquetes
  a sus fuentes con alias, así `npm test` no necesita build ni Docker.
- **Consecuencias**: imports relativos con extensión `.js` en el código fuente (requisito NodeNext).

## ADR-002 — Node del entorno
- **Contexto**: AGENTS.md pide Node 22 LTS; el equipo de desarrollo tiene Node 24.
- **Decisión**: `engines: ">=22"`; las imágenes Docker usan `node:22-alpine` como pide la spec.
- **Consecuencias**: sin efecto funcional.

## ADR-003 — Versión de Prisma
- **Contexto**: AGENTS.md pide "Prisma última estable" y el esquema obligatorio de
  `specs/02-modelo-datos.md` usa `generator client { provider = "prisma-client-js" }` con
  `url = env("DATABASE_URL")`. En Prisma 7 (última estable: 7.10.1) `prisma-client-js` está
  deprecado, `output` es obligatorio, el CLI no carga `.env` y el cliente Rust-free exige driver
  adapters (`@prisma/adapter-pg`), fuera de la lista de librerías acordadas.
- **Decisión**: fijar **Prisma 6.19.3** (última de la línea 6, estable), que acepta el esquema
  obligatorio sin modificar. Se deja anotado el paso a v7 como mejora futura (ADR aparte).
- **Consecuencias**: esquema y cliente tal como la spec; migración a v7 pendiente.

## ADR-004 — Stack de UI (Tailwind 3 + primitivas estilo shadcn/ui)
- **Contexto**: la spec pide Tailwind CSS + shadcn/ui sin fijar versión; Tailwind actual es 4.x.
- **Decisión**: Tailwind **3.4.19** con `tailwind.config.ts` y variables CSS, más las primitivas
  habituales de shadcn/ui (cva, clsx, tailwind-merge, lucide-react, radix dialog/tabs) escritas en
  `apps/web/components/ui`. Se omite `@tanstack/react-table`: la paginación es en servidor y una
  tabla HTML basta (ADR de no-dependencia).
- **Consecuencias**: sin cambios de API de Tailwind; migración a v4 opcional.

## ADR-005 — noVNC se sirve desde `public/novnc`
- **Contexto**: `specs/05-integraciones.md` §4 avisa de problemas de empaquetado de `@novnc/novnc`
  (top-level await) con algunos bundlers.
- **Decisión**: copiar `node_modules/@novnc/novnc` a `apps/web/public/novnc/` mediante script
  `postinstall` (Node, multiplataforma) y cargar el cliente como módulo ES nativo desde `/novnc`.
  El paquete npm queda como referencia de versión.
- **Consecuencias**: el visor no depende del bundler; hay que recordar ejecutar `postinstall` tras
  cambiar la versión de noVNC.
