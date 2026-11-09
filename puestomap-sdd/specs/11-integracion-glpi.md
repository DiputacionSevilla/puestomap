# 11 — CR-02: GLPI como fuente de verdad; PuestoMap como consola de asistencia remota

**Tipo:** cambio de alcance sobre un proyecto en curso (reduce y redirige; no rehace lo hecho).
**Precedencia:** donde esta spec contradiga a 00–10, **prevalece esta**.
**Prioridades:** `P0` imprescindible · `P1` valor alto, tras P0 · `P2` opcional, solo si se pide.

---

## 0. Por qué (leer primero)

El Ayuntamiento ya mantiene GLPI (incidencias + inventario) y OCS Inventory, y ninguno está al día.
PuestoMap v1 + CR-01 añade un **tercer inventario** (edificios/despachos propios, directorio de
usuarios por CSV, importación de equipos por CSV, página de calidad). Eso aumenta la dispersión de
datos y el mantenimiento, que es justo lo que se quiere evitar.

**Principio rector:** *cada dato tiene un único dueño.*

- **GLPI es el dueño del inventario**: equipos, hardware, usuarios, lugares (edificio/planta/despacho),
  estado, número de serie, etiqueta de inventario.
- **PuestoMap es dueño solo de lo que GLPI no tiene**: la asistencia remota (credenciales VNC,
  puertos/pantallas, sondeo en vivo, sesiones y auditoría) y la **representación gráfica**
  (plano por lugar y posición x/y del puesto).
- PuestoMap **no pide que se le teclee ni se le cargue por CSV nada que ya exista en GLPI**.
- **Invariante de recuperación:** si se pierde la BD de PuestoMap, el inventario sigue íntegro en
  GLPI; solo se pierden posiciones en plano, credenciales/puertos VNC e historial de sesiones.

Además se **retira OCS como fuente** (ver §8). GLPI 10 trae inventario nativo con *glpi-agent*;
OCS pasa a ser un sistema a apagar, no a integrar.

## 1. Entorno GLPI (hechos conocidos)

- Versión en producción: **GLPI 10.0.0** (2022). Solo existe la API REST clásica
  (`<GLPI>/apirest.php`, cabeceras `App-Token` + `Session-Token`). La API v2 es de GLPI 11: **no usar**.
- Recomendación operativa (no es tarea del agente): actualizar GLPI a la última 10.0.x antes de
  producción (10.0.0 es la primera versión de la rama y tiene correcciones de seguridad posteriores).
  El código no debe depender de nada posterior a 10.0.0.
- URL pública `soporte.mairenadelalcor.net`; IP interna del servidor GLPI `10.158.1.220`.
  **Lección ya vivida** en `glpi-incidencias-movil` (ver su `MEMORIA_PROYECTO.md`, 2026-09-02): desde la
  red interna ese dominio sale por la ruta pública y el filtro DNS de Fortinet devuelve una página HTML
  en lugar de JSON. Por tanto `GLPI_BASE_URL` del worker debe resolverse a la IP privada
  (`extra_hosts` en el compose, o URL interna), y el cliente debe **detectar respuestas no-JSON** y
  fallar con un error claro («GLPI devolvió HTML: revisar DNS/proxy»).
- Existe un proyecto hermano, `Aplicaciones/glpi-incidencias-movil`, con un cliente de la API ya
  probado (`lib/glpi/client.ts`: App-Token, Session-Token, timeout, reintento solo en GET,
  clasificación de errores; y `lib/glpi/search-options.ts`). **Reutilizar su diseño** (copiar y adaptar,
  sin crear dependencia entre repositorios ni añadir librerías; usar `fetch` nativo).

## 2. Alcance

| Incluido | Prio |
|---|---|
| Cliente GLPI (API REST) y sincronización periódica **solo lectura** de equipos → caché local | P0 |
| Lugares de GLPI → Edificio/Planta/Despacho (con `glpiLocationId`); el plano y el `rect` siguen siendo de PuestoMap | P0 |
| Usuarios de GLPI → usuario de dominio del equipo y directorio (sustituye al CSV de AD) | P0 |
| Ficha, listado y mapa: campos de GLPI en **solo lectura** con enlace «Abrir en GLPI» | P0 |
| Enlace de vuelta: `GET /equipos/glpi/[ID]` para el «Enlace externo» de GLPI | P0 |
| Importación reducida `posiciones.csv` (solo posición y plano; resto retirado de la UI) | P0 |
| Calidad de datos redefinida (problemas de GLPI se corrigen en GLPI) | P1 |
| Escritura a GLPI de la **ubicación** al mover un puesto de despacho en el mapa (flag, desactivada) | P1 |
| Seguimiento automático en la incidencia de GLPI al cerrar una sesión remota (flag, desactivado) | P2 |
| Retirada del sync OCS y del código muerto de importaciones | P1 (tras validar) |
| Departamentos desde Grupos de GLPI | P2 |
| «Instalado TightVNC» desde el software inventariado en GLPI | P2 |

**Fuera de alcance:** escribir en GLPI ningún dato de inventario salvo la ubicación (P1); crear
incidencias desde PuestoMap; autenticación SSO con GLPI (la auth local/LDAP de PuestoMap no cambia);
API v2; tocar el esquema o plugins de GLPI.

## 3. Reparto de la propiedad de los datos

| Dato | Dueño | En PuestoMap |
|---|---|---|
| `hostname`, nº de serie, etiqueta de inventario (`otherserial`), fabricante, modelo, SO | GLPI | caché, solo lectura |
| IP, MAC | GLPI (inventario nativo) | caché, solo lectura |
| Usuario asignado (`users_id`) | GLPI | caché → `adUsername` (login) |
| Último usuario inventariado (`contact`) | GLPI | caché → `lastUser`/`lastUserNorm` |
| Lugar (`locations_id`) | GLPI | caché → `floorId`/`officeId` vía `glpiLocationId` |
| Estado, papelera (`is_deleted`) | GLPI | papelera ⇒ `archived = true` |
| Último inventario (`last_inventory_update`) | GLPI | caché → `ocsLastInventory` se renombra a `lastInventoryAt` (ver §4) |
| **Plano** de la planta, **`rect`** del despacho | PuestoMap | editable |
| **`posX`/`posY`** del puesto | PuestoMap | editable (mapa) |
| Credencial VNC, puerto, pantallas, sondeo, `vnc*` | PuestoMap | editable/automático |
| Sesiones remotas, auditoría | PuestoMap | propio (y P2: eco a GLPI) |
| `notes` (notas técnicas de PuestoMap) | PuestoMap | editable; **no** se sincroniza con el comentario de GLPI |
| `assignedTo` (texto), `phoneExt` | — | **se eliminan de la edición**; se muestran `User.realname/firstname` y teléfono del usuario de GLPI |

Regla DM-2 sustituida: **el sync de GLPI solo escribe las columnas de la tabla «GLPI»**; jamás toca
posición, VNC, credenciales ni `notes`. Ninguna ruta de PuestoMap debe poder editar columnas cuyo
dueño es GLPI (el `PATCH /api/computers/:id` las quita de su lista blanca → 400 si llegan).

## 4. Modelo de datos (delta; migración **aditiva** `cr02_glpi`)

```prisma
enum DataSource { OCS CSV MANUAL GLPI }          // ALTER TYPE … ADD VALUE 'GLPI'

model Computer {
  // … existentes …
  glpiId         Int?      @unique               // Computer.id en GLPI (clave de casación)
  glpiSyncedAt   DateTime?
  glpiState      String?                         // nombre del estado (Producción, Almacén…)
  glpiUserName   String?                         // nombre completo del usuario asignado (caché)
  lastInventoryAt DateTime?                      // last_inventory_update (agente nativo)
}
model Building   { glpiLocationId Int? @unique }
model Floor      { glpiLocationId Int? @unique }
model Office     { glpiLocationId Int? @unique }
// DirectoryUser: source pasa a poder valer "GLPI"; añadir glpiUserId Int? @unique
```

- `ocsId`, `ocsLastInventory` y los campos OCS **no se borran** en esta migración (aditiva). Se marcan
  obsoletos; su eliminación es la tarea T-79 (P1, tras validar).
- `hostname` sigue siendo la clave de negocio (DM-1); se normaliza `trim().toUpperCase()` y, si
  `GLPI_STRIP_DOMAIN=true` (def.), se corta en el primer punto (`pc01.ayto.local` → `PC01`).
- Casación en el sync: 1º `glpiId`; 2º `hostname` normalizado (adopta equipos ya existentes y conserva
  su posición/VNC); 3º se crea (`source = GLPI`).

## 5. Integración con la API de GLPI

### 5.1 Configuración (`.env`, solo **nombres** en `.env.example`)

```
GLPI_BASE_URL=            # https://…  (sin /apirest.php). Debe resolver a la IP privada (§1)
GLPI_APP_TOKEN=
GLPI_USER_TOKEN=          # token API personal de la cuenta de servicio
GLPI_ALLOW_HTTP=false     # HTTP solo si true (red interna sin TLS)
GLPI_TIMEOUT_MS=15000
GLPI_SYNC_CRON=*/30 * * * *
GLPI_STRIP_DOMAIN=true
GLPI_LOCATION_ROOT_ID=    # id del lugar raíz del Ayuntamiento (opcional)
GLPI_LOCATION_DEPTHS=1,2,3   # niveles bajo la raíz: edificio, planta, despacho
GLPI_WRITEBACK_LOCATION=false     # P1
GLPI_FOLLOWUP_ON_SESSION_END=false # P2
GLPI_DEPARTMENT_SOURCE=none        # none | group (P2)
INVENTORY_SOURCE=glpi              # glpi | ocs (heredado) | none
```

### 5.2 Cuenta de servicio en GLPI (la crea el humano; documentar en `docs/operacion.md`)

Usuario `svc-puestomap` con **perfil de solo lectura** sobre Equipos, Lugares, Usuarios (y Grupos si
P2), API habilitada (*Configuración → General → API*), cliente API con App-Token y IP de `docker1`
restringida. Token personal por usuario (`user_token`). Para P1/P2 se usa **otro perfil/token**
distinto con el mínimo permiso de escritura (actualizar ubicación del equipo; añadir seguimientos).
Nunca la cuenta de un técnico.

### 5.3 Cliente (`apps/worker/src/glpi/client.ts`, función pura de transporte inyectable)

- `initSession` con `Authorization: user_token <token>` + `App-Token`; reutiliza el `Session-Token`
  durante el ciclo y hace `killSession` al terminar (también en error).
- Peticiones con timeout, reintento con backoff **solo en GET**, errores clasificados
  (`SESSION_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `UNAVAILABLE`, `NON_JSON`).
- Paginación con `range=a-b` (lotes de 200) y cabecera `Content-Range`; sin `expand_dimensions`
  innecesarios.
- **Nunca** loguear tokens ni cuerpos con datos personales.
- Descubrir los *search options* reales con `listSearchOptions/Computer` (ver el
  `search-options.ts` del proyecto hermano) en lugar de fijar números de campo a ciegas: IP, MAC,
  usuario y último inventario son campos de búsqueda, no columnas de `/Computer`. Los ids que se usen
  se centralizan en un único módulo y se validan contra el JSON real (§5.7 `[STOP]`).

### 5.4 Sincronización de equipos (`apps/worker/src/sync/glpi.ts`)

1. Lista `Computer` con `is_deleted=0`, `is_template=0`; si hay `glpi.lastSyncAt`, solo los
   modificados desde entonces (`date_mod`) con margen de 1 h; **barrido completo cada noche** para
   detectar borrados/papelera.
2. Por equipo: `mapGlpiComputer(json) → ComputerUpsert` (**función pura** en el worker, con tests).
   IP = primera IPv4 de los puertos de red no loopback; si hay varias, la de la red permitida por
   `ALLOWED_CIDRS` (si ninguna, la primera).
3. `mergeGlpiComputer` escribe solo las columnas de la tabla §3 con dueño GLPI.
4. Equipos que pasan a papelera o desaparecen en el barrido nocturno → `archived = true` (nunca se
   borran, DM-6). Si reaparecen, se desarchivan.
5. Traza en `SyncRun` (tipo nuevo `GLPI`: `ALTER TYPE SyncType ADD VALUE 'GLPI'`) con
   `{created, updated, unchanged, archived, errors}`.
6. Concurrencia 4, bloqueo para que no se solapen dos syncs, y botón «Sincronizar ahora» (el mecanismo
   `ocs.requestedAt` actual se generaliza a `glpi.requestedAt`).
7. Si GLPI no responde, el sync falla limpio (`ERROR`), **no borra ni archiva nada** y la UI muestra
   «Última sincronización correcta: …» en rojo si supera 3× el intervalo.

### 5.5 Lugares → estructura física

- Árbol `Location` de GLPI (`completename`, `level`, `locations_id`) bajo `GLPI_LOCATION_ROOT_ID`.
- Convención por profundidad (`GLPI_LOCATION_DEPTHS`): nivel 1 = **Edificio**, nivel 2 = **Planta**,
  nivel 3 = **Despacho**. Lugares más profundos se asimilan al despacho de nivel 3 y se anota un aviso.
  El equipo cuyo lugar no cabe en el modelo queda con `officeId = null` y se lista en Calidad.
- Upsert por `glpiLocationId`; si no existe, casa por `normKey` (nombre) dentro del padre y adopta la
  entidad existente. **Nunca borra** edificios/plantas/despachos con equipos o plano; los lugares
  desaparecidos se marcan «No existe en GLPI» (aviso en `/ajustes`).
- Código de edificio/despacho: se deriva de `name` con `normKey` mayúsculas si no hay otro campo; el
  humano puede editar solo el **código visible** y el plano/`rect`, nunca el nombre ni la jerarquía.
- Plano (`Floor.planFile`) y `Office.rect` siguen subiéndose/editándose en PuestoMap (RF-05, T-27).
- Nada de crear edificios/plantas/despachos desde PuestoMap: el botón se sustituye por «Gestionar en
  GLPI» (enlace a `/front/location.php`). *(El humano puede cargar la estructura inicial en GLPI con
  su importador CSV nativo de lugares; `estructura.csv` de CR-01 sirve de base.)*

### 5.6 Usuarios

- Sync de `User` activos de GLPI (login `name`, `realname`, `firstname`, `phone`, `is_active`) →
  `DirectoryUser` con `source = "GLPI"` (sustituye a `ad-usuarios.csv`; la importación CSV de
  directorio se retira de la UI).
- `Computer.users_id` → `adUsername = normalizeAdUser(User.name)` y `glpiUserName` (caché).
- `lastUser`/`lastUserNorm` = campo `contact` de GLPI (lo rellena el agente con el último usuario).
- `deriveUserMatch` se conserva tal cual (asignado en GLPI vs. último usuario inventariado).
- Visibilidad: siguen ocultos a `VIEWER` (RF-17 CA-7).

### 5.7 Procedimiento obligatorio antes de escribir el mapper `[STOP]`

Los nombres de campo varían entre versiones. El agente debe pedir al humano:

```powershell
# 1) sesión (el humano pone sus tokens; NO pegarlos en el chat ni en el repo)
$h = @{ "App-Token"=$env:GLPI_APP_TOKEN; Authorization="user_token $env:GLPI_USER_TOKEN" }
$s = (Invoke-RestMethod "$env:GLPI_BASE_URL/apirest.php/initSession" -Headers $h).session_token
$h2 = @{ "App-Token"=$env:GLPI_APP_TOKEN; "Session-Token"=$s }
# 2) un equipo real y sus relaciones
Invoke-RestMethod "$env:GLPI_BASE_URL/apirest.php/Computer/<ID>?expand_dimensions=true&with_networkports=true" -Headers $h2 | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 glpi-computer.json
Invoke-RestMethod "$env:GLPI_BASE_URL/apirest.php/listSearchOptions/Computer" -Headers $h2 | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 glpi-searchoptions-computer.json
Invoke-RestMethod "$env:GLPI_BASE_URL/apirest.php/Location?range=0-50" -Headers $h2 | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 glpi-locations.json
Invoke-RestMethod "$env:GLPI_BASE_URL/apirest.php/killSession" -Headers $h2
```

Anonimizar y guardar en `apps/worker/test/fixtures/glpi-*.json`. Hasta entonces, desarrollar contra
`glpi-computer.sample.json` creado por el agente y dejar **pendiente** la validación con el real.

## 6. Requisitos funcionales

### RF-20 Sincronización con GLPI — P0
- CA-1: el worker sincroniza equipos, lugares y usuarios según §5; `INVENTORY_SOURCE=glpi` por defecto.
- CA-2: **idempotente**: dos syncs seguidos sin cambios en GLPI producen 0 actualizaciones.
- CA-3: la posición, VNC, credenciales, pantallas y `notes` de un equipo no cambian tras un sync.
- CA-4: `/ajustes` muestra estado de la conexión (OK/Error), última sync correcta, recuentos
  y botón «Probar conexión» y «Sincronizar ahora» (ADMIN). Sin exponer tokens.
- CA-5: modo sombra: con `GLPI_SHADOW=true` el sync **no escribe**, solo genera el informe de
  diferencias (equipos nuevos, sin casar, hostname duplicado, lugares sin mapear) para validar antes
  del corte (§9).

### RF-21 Datos de GLPI en solo lectura, con enlace — P0
- CA-1: en ficha y listado, cada campo con dueño GLPI se muestra con la etiqueta «GLPI» y sin
  control de edición. Botón **«Abrir en GLPI»** (`${GLPI_BASE_URL público}/front/computer.form.php?id=<glpiId>`;
  la URL pública se configura aparte: `GLPI_PUBLIC_URL`).
- CA-2: se retiran de la UI y de la API: edición de `assignedTo`/`phoneExt`/ubicación textual, alta
  manual de equipos, importación CSV de equipos/estructura/directorio y los pasos 1, 3 y 4 del
  asistente. Quedan ocultos tras `LEGACY_IMPORT_ENABLED=false` (def.) hasta su borrado (T-79).
- CA-3: el listado y la búsqueda global siguen encontrando por hostname, IP, usuario (login y nombre)
  y serie. El filtro por departamento solo existe si `GLPI_DEPARTMENT_SOURCE=group`.
- CA-4: los datos de usuario (nombre, teléfono) solo visibles a TECH/ADMIN.

### RF-22 Enlace desde GLPI hacia PuestoMap — P0
- CA-1: `GET /equipos/glpi/[glpiId]` (requiere sesión; si no, login con `callbackUrl`) redirige a la
  ficha del equipo. Si el equipo aún no está sincronizado, muestra «Todavía no sincronizado» con
  botón «Sincronizar ahora» (TECH/ADMIN) y no revela datos.
- CA-2: variante `GET /equipos/glpi?name=[NAME]` por hostname para equipos sin `glpiId` aún.
- CA-3: documentar en `docs/operacion.md` el alta del enlace en GLPI (*Configuración → Enlaces
  externos*): nombre «Asistencia remota», enlace `https://puestomap…/equipos/glpi/[ID]`,
  tipos de elemento: Equipo. (No requiere plugin.)
- CA-4: la ficha incluye el campo **«Motivo/incidencia»** al iniciar sesión: acepta nº de ticket de
  GLPI (`#1234`) y lo enlaza a `…/front/ticket.form.php?id=1234` en el historial de sesiones.

### RF-23 Posiciones (carga reducida) — P0
- CA-1: `posiciones.csv` (`hostname;pos_x;pos_y;despacho_codigo?`) como única importación de equipos
  que sigue activa; solo escribe `floorId` (si el lugar GLPI ya lo fijó, se respeta), `posX/posY` y
  asigna despacho por `findOfficeAt` si procede. Reutilizar `import-rules.ts` (reglas 5–7 de specs/10 §5.2).
- CA-2: hostname sin equipo sincronizado → error `EQUIPO_NO_SINCRONIZADO` (no se crea).
- CA-3: arrastrar el marcador en el mapa sigue funcionando (RF-04) y es la vía normal.
- CA-4: equipos con `floorId`/`officeId` provenientes de GLPI y sin posición se pueden **colocar en el
  plano arrastrándolos desde una bandeja «Sin colocar»** de la planta.

### RF-24 Calidad de datos (redefinida) — P1
| `check` | Condición | Se corrige en |
|---|---|---|
| `sinColocar` | con planta (por lugar GLPI) y sin `posX/posY` | PuestoMap (mapa) |
| `sinLugar` | sin `locations_id` en GLPI | GLPI |
| `lugarNoMapeado` | lugar fuera de la profundidad de §5.5 | GLPI |
| `sinUsuario` | `users_id` vacío en GLPI | GLPI |
| `usuarioDistinto` | `adUsername` ≠ `lastUserNorm` (ambos informados) | GLPI |
| `sinIp` | sin IP | GLPI |
| `sinInventario` | `lastInventoryAt` nulo o > 30 días | GLPI (agente) |
| `noEnGlpi` | `glpiId` nulo (equipo heredado/manual) | GLPI |
| `posicionSolapada` | otro equipo a < 0,015 | PuestoMap |
- Cada tarjeta enlaza a `/equipos?check=…`; la fila/ficha ofrece «Corregir en GLPI» (enlace) en los
  checks cuya corrección es en GLPI. Los CSV por check se conservan.

### RF-25 Escritura de la ubicación a GLPI — P1 (flag `GLPI_WRITEBACK_LOCATION`, desactivado)
- CA-1: al soltar un puesto en el rect de otro despacho, si el flag está activo y el despacho tiene
  `glpiLocationId`, se hace `PUT /Computer/:glpiId {locations_id}` **solo** si el usuario confirma
  («Se actualizará también el lugar en GLPI»). Aviso deshacible.
- CA-2: fallo de GLPI ⇒ el cambio local **no se pierde** pero se marca «Pendiente de enviar a GLPI»
  y se reintenta en el siguiente ciclo; auditoría `computer.glpi_location` con valor anterior/nuevo.
- CA-3: nunca se escribe ningún otro campo en GLPI. Test que lo fije.

### RF-26 Seguimiento en la incidencia — P2 (flag `GLPI_FOLLOWUP_ON_SESSION_END`)
- CA-1: si la sesión se inició con un nº de ticket válido y el flag está activo, al finalizar se
  añade un `ITILFollowup` privado: «Asistencia remota a PC-XXX por <técnico>, duración mm:ss».
  Sin datos personales del usuario final. Fallo ⇒ solo log; no afecta a la sesión.

## 7. API (delta sobre 04)

| Método | Ruta | Rol | Cambio |
|---|---|---|---|
| POST | `/api/glpi/test` | A | Prueba de conexión (initSession/killSession), devuelve versión de GLPI y latencia |
| POST | `/api/glpi/sync` | A | Solicita sync (`glpi.requestedAt`) |
| GET | `/api/glpi/status` | T | Estado, última sync, recuentos |
| GET | `/equipos/glpi/[id]` | T | RF-22 (página, no API) |
| PATCH | `/api/computers/:id` | T | Lista blanca reducida a campos de PuestoMap: `posX/posY`, `vnc*`, `credentialId`, `notes`, `officeId` solo si se recoloca (RF-25) |
| POST/DELETE | `/api/computers` (alta manual), `/api/import/{structure,computers,directory}/*`, `/api/directory` (vaciar) | — | 404 con `LEGACY_IMPORT_ENABLED=false` |
| POST | `/api/import/positions/preview` · `/commit` | A | RF-23 |

## 8. OCS

- `INVENTORY_SOURCE=glpi` desactiva el cron de OCS. El código OCS **permanece** hasta T-79 (sin
  borrarlo en esta fase por si el corte se aplaza).
- T-20 (validar el mapper OCS con JSON real) **queda cancelada**: sustituida por T-70.
- Decisión operativa (humano, fuera de este repo): desplegar *glpi-agent* por GPO y apagar OCS cuando
  GLPI muestre inventario al día. PuestoMap no depende de OCS en ningún caso.

## 9. Plan de corte (humano + agente)

1. **Humano:** verificar en GLPI que el inventario es fiable: ≥ 95 % de los PCs con
   `last_inventory_update` < 30 días y con lugar asignado. Si no, **eso** es lo primero (no se arregla
   con software nuevo). La BD Docker de PuestoMap tiene 0 equipos y T-63 (carga real) no se ha
   hecho: **no hay datos que migrar**; no se debe hacer la carga real de CR-01 (T-63 queda sustituida
   por T-80).
2. **Modo sombra** (`GLPI_SHADOW=true`): informe de diferencias; corregir en GLPI.
3. **Activar** sync real; verificar CA-2/CA-3 de RF-20.
4. **Colocar** puestos en plano (RF-23) y probar la asistencia remota con equipos reales.
5. Activar el enlace externo en GLPI (RF-22).
6. Tras 2 semanas estables: T-79 (retirar OCS y código legado) y, si se decide, apagar OCS.

## 10. Reglas de este cambio

- Migraciones Prisma **aditivas** (nada de `reset` ni borrar columnas hasta T-79).
- Sin dependencias nuevas (usar `fetch` nativo). Lógica nueva en `packages/shared` o en el worker como
  **funciones puras** con tests; cliente con transporte inyectable.
- **Prohibido** escribir datos de inventario en GLPI (solo RF-25/RF-26 con sus flags).
- Seguridad: tokens de GLPI solo en variables de entorno del **worker** (y de `web` únicamente si RF-25/26
  se ejecutan allí); nunca en logs, respuestas HTTP, BD ni repo. `.env.example` solo nombres.
- Las exportaciones CSV siguen pasando por `sanitizeCsvCell`.
- UI en español, fechas en `Europe/Madrid`.
- No romper los invariantes de `AGENTS.md` §5–§6 (gateway, origen estricto, lock de sesiones, noVNC).
- No hacer commit/push salvo petición expresa. **Antes de empezar**, el humano debe commitear el
  árbol de trabajo actual (74 ficheros sin versionar) para que el cambio sea revisable.

## 11. Tests

| ID | Prueba |
|---|---|
| T-U20 | `mapGlpiComputer`: IP/MAC elegidas, hostname sin dominio, usuario, `contact`, lugar; campos ausentes |
| T-U21 | `mergeGlpiComputer`: solo escribe columnas GLPI; no toca posición/VNC/notes |
| T-U22 | Cliente GLPI con `fetch` falso: sesión, paginación `Content-Range`, reintento solo GET, respuesta HTML ⇒ `NON_JSON`, `killSession` también en error |
| T-U23 | Árbol de lugares → edificio/planta/despacho por profundidad; aviso en lugares más profundos |
| T-I7 | Sync completo con GLPI falso (HTTP local): crea, actualiza, archiva por papelera, idempotente, GLPI caído ⇒ no archiva nada |
| T-I8 | `PATCH /api/computers/:id` rechaza campos propiedad de GLPI |
| T-I9 | RF-22: sin sesión ⇒ login; con sesión ⇒ redirección; no sincronizado ⇒ mensaje sin datos |
| T-I10 | RF-25: solo se envía `locations_id`; fallo ⇒ pendiente y reintento |
| T-I11 | Posiciones CSV (RF-23): idempotente; hostname desconocido ⇒ error |

`npm run verify` debe seguir en verde en cada tarea.
