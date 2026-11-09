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

## ADR-006 — CR-01 incorporado (2026-11-09)
- **Contexto**: durante la ejecución se incorpora `puestomap-sdd/specs/10-ubicaciones-planos-usuarios.md`
  (CR-01: carga de ubicaciones, planos y usuarios del dominio). Precedencia: donde contradiga a 02–09,
  prevalece.
- **Decisión**: se adopta CR-01 completo. Las tareas previas ya ejecutadas (T-05…T-16) se completan con
  el delta en la fase **F8** (T-50…T-64). Las tareas aún no ejecutadas (mapa T-23…T-27, gateway/visor
  T-28/T-30, worker T-19) se implementan ya con el delta integrado (regla §0.7 de CR-01). Orden:
  P0 primero, después P1; P2 solo si se pide.
- **Consecuencias**: migraciones Prisma aditivas; funciones nuevas puras en `packages/shared` con tests;
  fixtures sintéticos en `fixtures/carga-ayto/`; los CSV reales de carga no se versionan (`data/carga/`).

## ADR-007 — Decisiones menores de implementación
- `computeVncInstalled` regla 3 (02 §3): el origen se marca `OCS` porque la evidencia principal es el
  inventario reciente sin TightVNC; el rechazo del puerto lo confirma.
- Bloqueo de cuenta (RF-01 CA-2): el contador de intentos fallidos se reinicia con el éxito o al
  caducar el bloqueo; la ventana de 10 min se aproxima usando la marca de tiempo del último intento.
- `probeComputer` (05 §2): "conecta o rechaza" cuenta como host vivo (RF-09 CA-2). En loopback un puerto
  cerrado responde con RST, así que el caso T-I1 "puertos online cerrados → online=false" se prueba con
  timeouts inyectados (el transporte es inyectable, como en `createGateway`).
- `@tanstack/react-table` no se usa: la paginación es en servidor y la tabla HTML es suficiente.


## ADR-008 — GLPI como fuente de verdad; PuestoMap como consola de asistencia remota (CR-02, 2026-11-09)
- **Contexto**: GLPI 10.0.0 (inventario nativo e incidencias) y OCS ya están en uso y sus datos no están
  al día. PuestoMap v1+CR-01 se estaba convirtiendo en un tercer inventario (estructura, usuarios y
  equipos por CSV), aumentando la dispersión y el mantenimiento.
- **Decisión**: cada dato tiene un único dueño. GLPI es dueño del inventario (equipos, lugares,
  usuarios); PuestoMap solo de asistencia remota (VNC, sondeo, sesiones, auditoría) y de la
  representación gráfica (plano, `rect`, posición). Sincronización GLPI→PuestoMap **solo lectura** por
  API REST clásica (`apirest.php`) con cuenta de servicio; única escritura permitida (con flags): la
  ubicación (RF-25) y el seguimiento de ticket (RF-26). OCS deja de ser fuente (`INVENTORY_SOURCE=glpi`) y
  su código se retira tras validar. Ver `puestomap-sdd/specs/11-integracion-glpi.md` (prevalece sobre 00–10).
- **Consecuencias**: se pierden el alta/edición manual y las cargas CSV de equipos, estructura y
  directorio (se ocultan, luego se borran); T-20 (mapper OCS), T-41 y T-63 quedan sustituidas por F9.
  Si se pierde la BD de PuestoMap, el inventario sigue en GLPI. Dependencia nueva: disponibilidad de la
  API de GLPI y del DNS interno hacia el servidor (lección del bloqueo Fortinet de `glpi-incidencias-movil`).
