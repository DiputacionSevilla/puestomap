# 10 — CR-01: carga de ubicaciones, planos y usuarios del dominio

**Tipo:** cambio sobre un proyecto en curso (aditivo, sin romper lo existente).
**Precedencia:** donde esta spec contradiga a 02–09, prevalece esta.
**Prioridades:** `P0` imprescindible para cargar el edificio del Ayuntamiento · `P1` valor alto, tras P0 · `P2` opcional.

---

## 0. Cómo incorporarlo (procedimiento para el agente)

El proyecto ya está avanzado. **No rehagas lo ya hecho**: implementa solo el delta que falte.

1. Working tree limpio y `npm run verify` en verde (línea base). Si no, corrige antes.
2. Lee este documento entero, `AGENTS.md`, `tasks.md` y `docs/progress.md`.
3. Registra en `docs/decisions.md` un ADR "CR-01 incorporado" con la fecha y el alcance.
4. **Reconciliación**: para cada tarea de la columna "Afecta a" de §11, comprueba en el código si ya existe y qué parte del delta falta. Anota el resultado en `docs/progress.md` (tabla: tarea previa · estado · delta pendiente).
5. Actualiza las specs existentes según §12 (primer commit: `docs(CR-01): actualiza specs`).
6. Añade a `tasks.md` la fase **F8** (§11) y ejecuta el bucle normal de AGENTS.md. Orden: todas las `P0`, después `P1`; `P2` solo si se pide.
7. Si una dependencia previa no existe (p. ej. la importación CSV aún no está hecha), implementa directamente la versión completa descrita aquí y marca ambas tareas.

Reglas de este cambio:
- Migraciones Prisma **aditivas** (nada de reset ni de borrar columnas). Los datos existentes no se tocan.
- Sin dependencias nuevas relevantes (el SVG se valida con código propio; `papaparse` ya está).
- Las funciones nuevas de lógica van en `packages/shared` como **funciones puras** con tests.

---

## 1. Contexto y objetivo

La ubicación de los puestos se está cargando desde bocetos a mano (empezando por el Edificio Ayuntamiento: 3 plantas, 18 despachos, 36 puestos). Un proceso externo genera, por cada edificio:

- un **plano SVG por planta** (esquemático, sin nombres de personas),
- `estructura.csv` (edificio, plantas, departamentos y despachos con su rectángulo normalizado),
- `equipos.csv` (un equipo por puesto, con hostname, IP, asignado a, usuario de dominio, despacho y posición `pos_x/pos_y`),
- opcionalmente `ad-usuarios.csv` (exportación del controlador de dominio).

Objetivo: que la app **importe esos ficheros de forma repetible e idempotente**, muestre los puestos sobre el plano, asocie cada equipo a su **usuario de dominio**, y ofrezca una vista de **calidad de datos** para terminar la carga (equipos sin ubicar, sin usuario, con usuario distinto al asignado…).

## 2. Alcance

| Incluido | Prio |
|---|---|
| Importación de estructura con `rect_*` de despachos | P0 |
| Validación y servicio seguro de planos SVG; aviso al cambiar la proporción | P0 |
| Importación de equipos ampliada (`usuario_dominio`, creación, reglas de IP/posición/despacho, informe de errores) | P0 |
| Asistente `/importar/carga-inicial` | P0 |
| Mapa: capa de despachos, despacho automático al soltar, etiqueta configurable, filtro por departamento | P0 |
| Directorio de usuarios del dominio (CSV de AD) y asignación con autocompletado/sugerencias | P1 |
| Usuario de dominio en listado/ficha/mapa y marca de discrepancia con el último usuario de OCS | P1 |
| Página de calidad de datos | P1 |
| Verificación de identidad del equipo al conectar | P1 |
| Importar `ad-equipos.csv` como fuente de hostname/IP cuando OCS esté desactualizado | P2 |

**Fuera de alcance:** consulta LDAP en vivo, entidad "Puesto" independiente del equipo (los puestos sin equipo conocido se resuelven con el informe de errores y se reimportan), edición gráfica de paredes, reescalado automático de posiciones al cambiar de plano.

---

## 3. Modelo de datos (delta sobre 02)

```prisma
model Computer {
  // … campos existentes …
  adUsername   String?    // usuario de dominio asignado al puesto (sAMAccountName, minúsculas)
  lastUserNorm String?    // lastUser de OCS normalizado (sin dominio, minúsculas)
  @@index([adUsername])
  @@index([lastUserNorm])
}

model DirectoryUser {
  id          String   @id @default(cuid())
  username    String   @unique          // sAMAccountName en minúsculas
  displayName String
  givenName   String?
  surname     String?
  department  String?
  title       String?
  office      String?
  phone       String?
  searchName  String                    // normName(displayName)
  active      Boolean  @default(true)
  source      String   @default("AD_CSV")
  importedAt  DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([searchName])
}

model RemoteSession {
  // … campos existentes …
  desktopName String?    // nombre que anuncia el servidor VNC
  identityOk  Boolean?   // null = no comprobado
  resolvedBy  String?    // "dns" | "db"
}
```

- Migración: `cr01_ubicaciones_usuarios` (solo `ADD COLUMN` y `CREATE TABLE`).
- `Office.rect` ya existe (`Json?` con `{x,y,w,h}` normalizados): se empieza a poblar.
- `adUsername` no tiene FK a `DirectoryUser` (enlace blando por `username`) para que el orden de importación no importe.
- Regla DM-2 ampliada: la sincronización OCS escribe `lastUser` y `lastUserNorm`; **nunca** `adUsername`.
- Backfill: al aplicar la migración, un script único calcula `lastUserNorm` para los equipos existentes.

---

## 4. Requisitos funcionales

### RF-16 Carga inicial (asistente) — P0
- CA-1: `/importar/carga-inicial` (ADMIN) con 4 pasos independientes y omitibles: **1 Estructura, 2 Planos, 3 Directorio (opcional), 4 Equipos**. Cada paso muestra su estado (hecho / pendiente) según los datos existentes.
- CA-2: Paso 1 (`estructura.csv`): previsualización con recuentos (crear / actualizar / sin cambios), errores y avisos por fila; confirmación transaccional; informe descargable.
- CA-3: Paso 2 (planos): selección múltiple de ficheros SVG/PNG/JPG/WebP. Asignación automática a plantas por el nombre de fichero `<EDIFICIO>__<PLANTA>.<ext>`, comparando con `normKey` el código de edificio y el nombre de planta (`PLANTA-BAJA` ≡ "Planta baja"). Los no asignados se resuelven con un desplegable. Vista previa con dimensiones y avisos.
- CA-4: Paso 3 (directorio): ver RF-17 CA-1.
- CA-5: Paso 4 (`equipos.csv`): previsualización por fila con estado (crear / actualizar / sin cambios / aviso / error). Si hay errores, la confirmación exige marcar "omitir filas con error". Se ofrece `errores.csv` con las filas rechazadas, el código de error y todas sus columnas, para corregir y reimportar.
- CA-6: **Idempotencia**: reimportar el mismo fichero produce 0 cambios (todas las filas "sin cambios").
- CA-7: Auditoría `import.structure`, `import.plans`, `import.directory`, `import.computers` con recuentos.
- CA-8: Al terminar el paso 4, enlace directo al mapa de la primera planta con equipos y a `/calidad`.

### RF-17 Directorio de usuarios y usuario de dominio — P1
- CA-1: Importación de `ad-usuarios.csv` (ADMIN; formato en §5.3). Upsert por `username` en minúsculas. Opción "marcar como inactivos los ausentes" (desmarcada por defecto). Informe con altas, actualizaciones y filas inválidas.
- CA-2: Ficha del equipo: campo **Usuario de dominio asignado** con autocompletado (por `username` y `displayName`); al elegir muestra nombre completo, departamento y teléfono del directorio. Se puede escribir un usuario que no esté en el directorio (aviso).
- CA-3: Sugerencias a partir de `asignado_a`: hasta 5 usuarios del directorio ordenados por puntuación (`suggestDirectoryUsers`, §7). Si 2 o más empatan en la puntuación máxima se marca `ambiguo` y no se preselecciona ninguno.
- CA-4: El `lastUser` de OCS se muestra con el nombre completo cuando el usuario existe en el directorio.
- CA-5: Botón "Usar último usuario de OCS" (si `lastUserNorm` existe) que copia ese valor a `adUsername`.
- CA-6: Búsqueda global y filtro de texto del listado encuentran por `adUsername` y por `displayName` del directorio.
- CA-7: Los datos del directorio solo son visibles para TECH/ADMIN (los endpoints devuelven 403 a VIEWER). El ADMIN puede vaciar el directorio.

### RF-18 Calidad de datos — P1
- CA-1: `/calidad` (TECH/ADMIN): tarjetas con el recuento de cada *check* y, por edificio, el % de equipos ubicados en plano y el % con usuario asignado.
- CA-2: Cada tarjeta enlaza a `/equipos?check=<nombre>`.
- CA-3: Exportación CSV por check (`/api/quality/<check>.csv`) con las columnas de 05 §6.1 más la columna `motivo`; sirve de base para completar y reimportar.
- CA-4: El dashboard (RF-12) enlaza a `/calidad`.

| `check` | Condición (equipos no archivados) |
|---|---|
| `sinUbicar` | sin planta o sin posición |
| `sinDespacho` | con planta pero sin despacho |
| `sinUsuario` | `adUsername` nulo |
| `usuarioDistinto` | `adUsername` y `lastUserNorm` informados y distintos |
| `sinIp` | `ip` nula |
| `noVistoOcs` | `ocsLastInventory` > 30 días (o nulo con `ocsId`) |
| `sinOcs` | `ocsId` nulo |
| `usuarioFueraDirectorio` | `adUsername` ausente en `DirectoryUser` (solo si el directorio no está vacío) |
| `posicionSolapada` | otro equipo de la misma planta a distancia normalizada < 0,015 |

### RF-19 Verificación de identidad del equipo — P1
Motivo: los datos de IP de OCS pueden estar desactualizados (DHCP); una IP vieja podría llevar a conectar con otro PC.
- CA-1: Al crear una sesión WEB el gateway resuelve el destino con la política `TARGET_RESOLUTION` (`dns_first` por defecto): resuelve `hostname` (+ `DNS_SUFFIX` si existe) por DNS y, si falla, usa la IP almacenada. Debe seguir cumpliendo `ALLOWED_CIDRS`. Se guarda `targetIp` y `resolvedBy`.
- CA-2: Al recibir el evento `desktopname` de noVNC, el visor lo compara (sin distinguir mayúsculas, "contiene") con el hostname. Si no coincide, muestra un aviso rojo: «El equipo se identifica como "X", no como "HOSTNAME". Comprueba que es el correcto», con botón *Desconectar*. Es solo un aviso (no bloquea).
- CA-3: El visor informa a `POST /api/sessions/:id/identity` con `{desktopName}`; se guardan `desktopName` e `identityOk` y se audita `session.identity_mismatch` cuando proceda.
- CA-4: La ficha muestra un icono de aviso en las sesiones con `identityOk = false`.

### Deltas a requisitos existentes

| Req. | Cambio |
|---|---|
| RF-02 CA-1 | Nueva columna "Usuario dominio" (`adUsername`, con el nombre del directorio como tooltip) e icono si hay discrepancia con `lastUserNorm` |
| RF-02 CA-2 | La búsqueda incluye `adUsername` y `displayName` del directorio |
| RF-02 CA-3 | Nuevo parámetro `check` (valores de la tabla de RF-18), conservado en la URL |
| RF-03 CA-1/2 | Ficha: `adUsername` editable (RF-17) y `lastUser` con nombre completo |
| RF-04 CA-6 | **Obligatorio** (antes opcional): al soltar un marcador dentro del `rect` de un despacho se asigna ese despacho (y el departamento por DM-4) mostrando un aviso deshacible |
| RF-04 CA-10 | Tooltip del marcador: hostname, `assignedTo`, `adUsername`, IP, estado |
| RF-04 CA-11 | Selector "Etiqueta del marcador": hostname / asignado a / usuario de dominio (preferencia del navegador) |
| RF-04 CA-12 | Capa "Despachos": contorno del `rect` y código al pasar el ratón; panel lateral con los despachos de la planta y su nº de equipos; clic → zoom al `rect` |
| RF-04 CA-13 | Filtro de departamento en el mapa: atenúa (opacidad 0,25) los marcadores de otros departamentos |
| RF-05 CA-2 | SVG validado según §5.4; al reemplazar un plano con proporción distinta (> 1 %) se muestra un aviso y hay que confirmar; las posiciones se conservan tal cual (pueden quedar desplazadas) |
| RF-10 CA-1/2/4 | Sustituidos por las reglas de §5.1 y §5.2 |
| RF-12 | Enlace a `/calidad` |

---

## 5. Formatos y reglas de importación

Todos los CSV: UTF-8 (con o sin BOM), separador `;`, comillas opcionales (el Export-Csv de PowerShell las incluye), fin de línea CRLF o LF. **Las columnas se leen por nombre de cabecera** (sin distinguir mayúsculas ni tildes); las desconocidas se ignoran; el orden no importa. Así los CSV anteriores siguen siendo válidos.

### 5.1 `estructura.csv`
Cabecera: `tipo;codigo;nombre;edificio_codigo;planta_nombre;nivel;departamento_codigo;rect_x;rect_y;rect_w;rect_h` (las columnas `rect_*` son opcionales).

- Orden de proceso independiente del de las filas: `EDIFICIO` → `PLANTA` → `DEPARTAMENTO` → `DESPACHO`.
- `PLANTA`: `nombre`, `edificio_codigo`, `nivel`. `DESPACHO`: `codigo`, `nombre`, `edificio_codigo`, `planta_nombre`, `departamento_codigo` (puede ir vacío), `rect_*` opcionales.
- Búsqueda de plantas por `normKey(nombre)` dentro del edificio (evita duplicar "Planta baja" / "Planta Baja"). Al crear se conserva el nombre tal cual llega.
- `rect_*`: números con punto decimal; `x,y ≥ 0`, `w,h > 0`, `x+w ≤ 1` e `y+h ≤ 1` (tolerancia 0,0005). Se guardan como `Office.rect = {x,y,w,h}`. Rectángulos que se solapan en la misma planta → aviso `RECT_SOLAPADO` (no bloquea).
- Upsert por clave natural (edificio: `codigo`; planta: edificio + nombre normalizado; departamento: `codigo`; despacho: planta + `codigo`). Actualiza nombre, nivel, departamento y `rect` solo si la celda viene informada. **Nunca borra.**

### 5.2 `equipos.csv` (delta sobre 05 §6.1)
Se añade la columna opcional `usuario_dominio` (alias aceptado: `usuario`). Las columnas informativas de la exportación (`ultimo_usuario_ocs`, `so`, `estado_vnc`) se ignoran.

Reglas por fila, en este orden:
1. `hostname` obligatorio (vacío → error `HOSTNAME_VACIO`); se normaliza (DM-1). Duplicados dentro del fichero → error `HOSTNAME_DUPLICADO` en las filas posteriores.
2. Hostname desconocido → se **crea** el equipo (`source = CSV`) si la opción `crearEquipos` está activa (por defecto sí). OCS lo adoptará por hostname en su siguiente sincronización.
3. `ip`: debe ser IPv4 válida (error `IP_INVALIDA`). Se aplica solo si el equipo no tiene `ocsId` o su `ip` es nula; en otro caso se omite con aviso `IP_GESTIONADA_POR_OCS`.
4. `usuario_dominio` → `normalizeAdUser` → `adUsername`. Si el usuario existe en el directorio, `asignado_a` está vacío y el equipo no tiene `assignedTo`, se rellena `assignedTo` con su `displayName`. Usuario ausente del directorio (con directorio no vacío) → aviso `USUARIO_FUERA_DIRECTORIO`.
5. Ubicación: edificio/planta/despacho se resuelven con `normKey`. Si solo viene `despacho_codigo` y es único en el edificio, se deduce la planta. Despacho inexistente → error `DESPACHO_NO_ENCONTRADO`; despacho de otra planta → error `DESPACHO_OTRA_PLANTA`; planta inexistente → error `PLANTA_NO_ENCONTRADA`.
6. `pos_x`/`pos_y`: ambos o ninguno; entre 0 y 1 (error `POSICION_INVALIDA`); requieren planta. Si la planta no tiene plano → aviso `PLANTA_SIN_PLANO`. Posición a distancia < 0,015 de otro equipo → aviso `POSICION_SOLAPADA`.
7. Con posición y sin `despacho_codigo`: si `findOfficeAt` encuentra uno, se asigna (aviso informativo `DESPACHO_INFERIDO`). Con `despacho_codigo` y posición fuera de su `rect` → aviso `FUERA_DEL_DESPACHO` (no bloquea).
8. Celda vacía = no modificar. No existe sintaxis para vaciar campos en esta versión.
9. Idempotente: si ningún campo cambia, la fila es `sin cambios`.
10. Transacción única por importación. Con filas de error, la confirmación exige `omitirErrores = true`.

`errores.csv`: todas las columnas originales + `linea` + `codigo_error` + `detalle`.

### 5.3 `ad-usuarios.csv` (salida de `extras/carga-inicial/exportar-ad.ps1`)
Cabecera: `SamAccountName;DisplayName;GivenName;Surname;Department;Title;Office;TelephoneNumber`. `SamAccountName` obligatorio (se guarda en minúsculas). Filas sin `SamAccountName` o sin `DisplayName` → error de fila.

### 5.4 Planos
- SVG: ≤ `SVG_MAX_MB` (2 MB por defecto). Dimensiones desde `width`/`height` (px o sin unidad); si faltan o usan `%`/otras unidades, desde `viewBox`; si no hay ninguna, error.
- Se **rechaza** si contiene: `<script`, `<foreignObject`, `<iframe`, `<embed`, `<object`, atributos `on*=`, `javascript:`, `<!ENTITY`, o `href`/`xlink:href` que no sea `#id` ni `data:image/`.
- PNG/JPG/WebP: dimensiones con `image-size`, máx. 15 MB (RF-05).
- Servicio de `GET /api/floors/:id/plan`: `Content-Type` correcto, `X-Content-Type-Options: nosniff` y, para SVG, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.
- Convenciones del SVG generado: ver 05 §7. Las posiciones `pos_x/pos_y` y `rect_*` son relativas a ese fichero.

---

## 6. API (delta sobre 04)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/import/structure/preview` · `/commit` | A | Reglas de §5.1; respuesta `{rows:[{line,action,warnings[],errors[]}], summary}` |
| POST | `/api/import/computers/preview` · `/commit` | A | Reglas de §5.2; opciones `{crearEquipos, omitirErrores}`; `/commit` devuelve además la URL de `errores.csv` |
| GET | `/api/import/runs/:id/errors.csv` | A | Filas rechazadas de una importación |
| POST | `/api/import/plans/preview` | A | `multipart` con N ficheros → `[{fileName, matchedFloorId?, width, height, errors[], warnings[]}]` |
| POST | `/api/import/plans/commit` | A | `[{fileName, floorId}]` (los ficheros se reenvían o se referencian por token temporal de la previsualización) |
| POST | `/api/import/directory/preview` · `/commit` | A | Reglas de §5.3; opción `marcarAusentesInactivos` |
| DELETE | `/api/directory` | A | Vacía el directorio |
| GET | `/api/directory/users?q=` | T | Autocompletado (máx. 10) por `username` y `displayName` |
| GET | `/api/directory/suggest?name=` | T | Sugerencias `[{username, displayName, department, score, ambiguous}]` |
| PATCH | `/api/computers/:id` | T | La lista blanca incluye `adUsername` (normalizado y validado con `^[a-z0-9._-]{1,64}$`) |
| GET | `/api/computers` | V | Nuevo parámetro `check`; cada item incluye `adUsername`, `lastUserNorm`, `userMatch` y `directoryName?` |
| GET | `/api/floors/:id/computers` | V | Cada item incluye `assignedTo`, `adUsername`, `lastUser`, `officeId`, `departmentId`, `userMatch` |
| GET | `/api/offices?floorId=` | V | Incluye `rect` y `computerCount` |
| GET | `/api/quality` | T | `{checks:{<nombre>:n}, byBuilding:[{buildingId, total, placedPct, withUserPct}]}` |
| GET | `/api/quality/:check.csv` | T | Equipos del check con columna `motivo` |
| POST | `/api/sessions/:id/identity` | T | `{desktopName}` → guarda `desktopName`/`identityOk`; audita `session.identity_mismatch` |

`POST /api/floors/:id/plan` aplica las validaciones de §5.4 y devuelve `{width,height,aspectChanged,previous?}`.

---

## 7. Lógica compartida (`packages/shared`, funciones puras)

```ts
// keys.ts
normKey(s: string): string          // NFD sin marcas, minúsculas, [^a-z0-9]+ → "-", sin guiones en los extremos
normName(s: string): string         // NFD sin marcas, minúsculas, sin puntuación salvo espacios, espacios colapsados

// ad-user.ts
normalizeAdUser(raw: string | null | undefined, ignore?: string[]): string | null
// "AYTO\\jmlopez" → "jmlopez" · "JMLopez@ayto.local" → "jmlopez" · "" → null · en `ignore` (def. ["system"]) → null
deriveUserMatch(c: { adUsername?: string|null; lastUserNorm?: string|null }):
  "UNASSIGNED" | "MATCH" | "MISMATCH" | "NO_OCS_USER"

// name-match.ts
suggestDirectoryUsers(assignedTo: string, users: Pick<DirectoryUser,"username"|"displayName"|"givenName"|"surname"|"searchName">[], limit = 5):
  { username: string; displayName: string; score: number; ambiguous: boolean }[]
// Por cada token de la consulta, mejor coincidencia con los tokens del usuario:
//   exacto = 1 · prefijo de ≥ 3 letras = 0,7 · inicial ("M." o "M" frente a un token que empieza por M) = 0,5
// score = suma / nº de tokens de la consulta. Umbral mínimo 0,6. Orden por score desc, luego displayName.
// ambiguous = true si ≥ 2 resultados empatan en el máximo.

// geo.ts (ampliación)
findOfficeAt(offices: { id: string; rect: {x:number;y:number;w:number;h:number} | null }[], x: number, y: number): string | null
// Contiene el punto (bordes inclusivos). Si hay varios, el de menor área. null si ninguno.
rectsOverlap(a, b): boolean
aspectChanged(prev: {w:number;h:number}, next: {w:number;h:number}, tol = 0.01): boolean

// svg-validate.ts
validateSvg(content: string | Buffer, maxBytes: number):
  { ok: boolean; width?: number; height?: number; errors: string[] }
```

---

## 8. Interfaz (delta sobre 06)

- Nuevas rutas: `/importar/carga-inicial` (asistente de 4 pasos con barra de progreso) y `/calidad`.
- Listado: columna "Usuario dominio", icono de discrepancia, selector `check` en el panel de filtros.
- Ficha: bloque "Usuario" con autocompletado, sugerencias (chips con la puntuación; el ambiguo se muestra como "varias coincidencias") y botón "Usar último usuario de OCS".
- Mapa: conmutador de capa "Despachos", selector de etiqueta, filtro de departamento y panel de despachos (RF-04 CA-10…13).
- Visor remoto: aviso rojo de identidad (RF-19).
- Subida de plano: diálogo de confirmación cuando cambia la proporción.

---

## 9. Seguridad y privacidad

- `DirectoryUser` y los nombres asignados son datos personales: acceso solo TECH/ADMIN, sin exponerlos en endpoints públicos ni en logs; la exportación CSV queda en la auditoría (`export.computers`, `export.quality`).
- Las importaciones se auditan con usuario, fecha, nombre de fichero y recuentos (no el contenido).
- Los ficheros reales de carga (`equipos.csv`, `ad-usuarios.csv`, `puestos-*.csv`) **no se versionan**: añadir `data/carga/` al `.gitignore`. Solo se versionan los fixtures sintéticos de §12.
- Los SVG subidos se tratan como contenido no confiable (§5.4).

Variables nuevas en `.env.example`:

```dotenv
LASTUSER_IGNORE=system
TARGET_RESOLUTION=dns_first      # dns_first | ip_first
DNS_SUFFIX=                      # p. ej. .ayto.local (opcional)
SVG_MAX_MB=2
```

---

## 10. Tests mínimos añadidos

| ID | Qué | Casos |
|---|---|---|
| T-U12 | `normKey`, `normName`, `suggestDirectoryUsers` | `"PLANTA-BAJA"` ≡ `"Planta baja"`; `"M. Carmen Navarro"` encuentra a "María del Carmen Navarro …" con score ≥ 0,6; `"Patricia"` con dos candidatas → `ambiguous`; consulta sin coincidencias → `[]` |
| T-U13 | `normalizeAdUser`, `deriveUserMatch` | `DOM\Usuario`, `user@dom`, vacío, `SYSTEM`; los 4 estados de `deriveUserMatch` |
| T-U14 | `validateSvg` | dimensiones por `width/height`; por `viewBox`; sin dimensiones → error; rechaza `<script`, `onload=`, `<foreignObject`, `href="http://…"`; acepta `href="#id"` y `data:image/png` |
| T-U15 | `findOfficeAt`, `aspectChanged` | punto en borde, en solape (gana el menor), fuera; proporción igual / cambiada |
| T-U10+ | Importaciones | estructura: `rect` válido e inválido (`x+w>1`), planta con distinta capitalización no se duplica, reimportar = 0 cambios; equipos: crea desconocidos, regla de IP con `ocsId`, `usuario_dominio` normalizado, despacho de otra planta → error, `DESPACHO_INFERIDO`, `HOSTNAME_DUPLICADO`, `errores.csv` coherente |
| T-I5 | Aceptación con fixtures | Importar `fixtures/carga-ayto/` (estructura → 3 SVG → directorio → equipos): 3 plantas, 18 despachos con `rect`, 36 equipos ubicados (15 + 13 + 8); `/api/floors/:id/computers` los devuelve con posición; reimportar = 0 cambios |
| T-I6 | Identidad | gateway con resolución DNS simulada: `dns_first` usa la IP resuelta y `resolvedBy="dns"`; fallo de DNS → IP de BD y `resolvedBy="db"` |
| T-E2 | E2E (Playwright, opcional) | tras T-I5, abrir el mapa de Planta baja y ver 15 marcadores; `?focus=` resalta uno |

Los tests de este cambio corren sin red externa. La suite existente debe seguir en verde.

---

## 11. Tareas (añadir a `tasks.md` como fase F8)

| ID | Prio | Tarea | Afecta a |
|---|---|---|---|
| T-50 | P0 | Reconciliación y ADR (§0); tabla en `docs/progress.md` | todas las de la columna |
| T-51 | P0 | Modelo (§3): migración aditiva, backfill de `lastUserNorm`, mapper OCS escribe `lastUserNorm`, `.env.example` | T-05, T-19 |
| T-52 | P0 | `shared`: `keys`, `ad-user`, `name-match`, `geo` (ampliado), `svg-validate` + T-U12…T-U15 | T-07 |
| T-53 | P0 | Planos: validación y servicio seguro de SVG/imagen, aviso de proporción, cabeceras (§5.4) | T-11 |
| T-54 | P0 | Importación de estructura con `rect_*`, lectura por cabecera, informe y reglas (§5.1) + T-U10+ | T-16 |
| T-55 | P0 | Importación de equipos ampliada (§5.2), `errores.csv`, opciones `crearEquipos`/`omitirErrores` + T-U10+ | T-16 |
| T-56 | P0 | Asistente `/importar/carga-inicial` pasos 1, 2 y 4 (RF-16) | T-16 |
| T-57 | P0 | Mapa: despacho automático al soltar (RF-04 CA-6), capa de despachos, tooltip, etiqueta configurable, filtro de departamento (CA-10…13) | T-23…T-27 |
| T-58 | P0 | Fixtures `fixtures/carga-ayto/` y pruebas de aceptación T-I5 (+ T-E2 opcional) | — |
| T-59 | P1 | Directorio: importación, autocompletado, sugerencias, ficha, búsqueda; paso 3 del asistente (RF-17) | T-14, T-15 |
| T-60 | P1 | Listado/ficha/mapa: columna y filtro de usuario, icono de discrepancia, parámetro `check` (RF-02/03) | T-12, T-13, T-14 |
| T-61 | P1 | `/calidad`, `/api/quality`, export CSV y enlace desde el dashboard (RF-18) | T-33 |
| T-62 | P1 | Identidad del equipo: resolución DNS en el gateway, `desktopname` en el visor, endpoint e iconos (RF-19) + T-I6 | T-28, T-30 |
| T-63 | `[STOP]` P0 | Carga real: el humano importa estructura, planos y equipos reales y valida con la checklist de §13; el agente anota hallazgos en `docs/progress.md` | — |
| T-64 | P2 | Importar `ad-equipos.csv` (Name, IPv4Address, OperatingSystem, LastLogonDate, Description) como fuente secundaria de hostname/IP cuando OCS no los tenga; misma regla de IP que §5.2 | T-55 |

---

## 12. Cambios a las specs existentes (primer commit)

| Fichero | Cambio |
|---|---|
| `02-modelo-datos.md` | Añadir los campos y el modelo de §3; ampliar DM-2 |
| `03-funcional.md` | Añadir RF-16…RF-19 y aplicar la tabla de deltas de §4 |
| `04-api.md` | Incorporar las rutas de §6 |
| `05-integraciones.md` | §1.2: el mapper rellena `lastUserNorm`; §6.1: columna `usuario_dominio` y lectura por cabecera; nueva §8 con el formato `ad-usuarios.csv` |
| `06-ui.md` | Rutas y cambios de §8 |
| `07-despliegue.md` | Variables de §9 |
| `08-tests.md` | Tests de §10 |
| `tasks.md` | Fase F8 (§11) |

### Fixtures (`fixtures/carga-ayto/`)
Datos sintéticos con la geometría real del Edificio Ayuntamiento (sin personas reales):
`estructura.csv`, `planos/AYTO__PLANTA-BAJA.svg`, `planos/AYTO__PLANTA-1.svg`, `planos/AYTO__PLANTA-2.svg`, `equipos-ejemplo.csv` (36 equipos `TEST-…`), `equipos-ejemplo-errores.csv`, `ad-usuarios-ejemplo.csv` y un `README.md` con los resultados esperados de cada fichero. Cópialos a `apps/web/test/fixtures/carga-ayto/`.

---

## 13. Checklist de aceptación manual (T-63)

1. Paso 1 con el `estructura.csv` real: sin errores; 18 despachos con contorno visible en el mapa.
2. Paso 2: los 3 SVG se asignan solos a su planta; el mapa muestra el plano.
3. Paso 4 con `equipos.csv`: los equipos aparecen en su mesa; reimportar da 0 cambios.
4. Arrastrar un equipo de un despacho a otro asigna el despacho automáticamente.
5. `/calidad` muestra los pendientes; el CSV de `sinUsuario` o `sinOcs` abre en Excel con tildes correctas.
6. Una asistencia a un equipo real no muestra aviso de identidad; el nombre anunciado coincide con el hostname.
7. La ficha de un equipo con `lastUser` distinto al asignado muestra la marca de discrepancia.

## 14. Riesgos

| Riesgo | Mitigación |
|---|---|
| Sustituir un SVG por otro con distinto encuadre desplaza los marcadores | Aviso de proporción; documentado en 05 §7; las posiciones se regeneran en origen |
| Nombres homónimos (varias "Patricia", "M. Carmen") | Sugerencias con `ambiguous`; nunca se asigna automáticamente en caso de empate |
| `lastUser` de OCS puede ser un técnico o una cuenta de servicio | Solo es informativo (marca de discrepancia); `LASTUSER_IGNORE` filtra cuentas conocidas |
| IP desactualizada → conexión al equipo equivocado | RF-19: DNS primero y comprobación de `desktopname` |
| `DNS_SUFFIX` o DNS del contenedor mal configurados | Si falla, se usa la IP de BD y se registra `resolvedBy="db"`; el aviso de identidad cubre el resto |
| Datos personales en el repositorio | `.gitignore` de `data/carga/` y fixtures sintéticos |
