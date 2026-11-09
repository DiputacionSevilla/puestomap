# 04 — API (route handlers de `apps/web`)

Convenciones:
- JSON, validación de entrada y salida con zod (`packages/shared/schemas`).
- Errores: `{ error: { code: string, message: string, details?: unknown } }` con HTTP 400/401/403/404/409/422/500.
- Roles mínimos indicados por endpoint. `T` = TECH o ADMIN, `A` = ADMIN, `V` = cualquiera autenticado.
- Las mutaciones escriben `AuditLog` cuando aplique.

## Salud
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/health` | público | `{status:"ok", db:"ok"}`; 503 si la BD no responde |

## Equipos
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/api/computers` | V | Listado paginado. Query: `q, buildingId, floorId, departmentId, officeId, state (csv), unplaced, staleOcs, os, archived, sort, dir, page, pageSize` → `{items, total, page, pageSize}`; cada item incluye `state` derivado |
| GET | `/api/computers/export.csv` | V | Igual que el anterior sin paginar, en CSV (formato §6 de 05) |
| GET | `/api/computers/:id` | V | Ficha completa (sin contraseñas) + últimas sesiones + auditoría |
| POST | `/api/computers` | T | Alta manual `{hostname, ip?, …}` |
| PATCH | `/api/computers/:id` | T | Edición de campos de Gestión/Ubicación/VNC (whitelist estricta) |
| PATCH | `/api/computers/:id/position` | T | `{floorId, posX, posY, officeId?}` |
| DELETE | `/api/computers/:id/position` | T | Quitar del plano |
| POST | `/api/computers/:id/archive` · `/restore` | A | Archivar / restaurar |
| POST | `/api/computers/:id/probe` | T | Sondeo inmediato; devuelve estado actualizado |
| POST | `/api/computers/bulk` | A | `{ids[] \| filter, set:{credentialId?, departmentId?}}` |

## Sesiones remotas
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/computers/:id/sessions` | T | Body `{mode:"WEB"\|"NATIVE", reason?, force?, screen?, groupId?}`; `screen` = `"desktop"` (def., puerto principal) o índice de pantalla 1..N; `groupId` = uuid generado en el cliente que agrupa las sesiones abiertas a la vez. Si hay sesión ACTIVE de **otro usuario** en cualquier puerto del equipo y `force` no es true → 409 `{code:"SESSION_IN_USE", by, since}`. WEB → `{sessionId, wsUrl, password, screenLabel, targetPort}`; NATIVE → `{sessionId, url:"tightvnc://ip:puerto"}` (ver 09) |
| GET | `/api/sessions` | T | Listado paginado con filtros `status, userId, computerId, from, to` |
| POST | `/api/sessions/:id/end` | T | Cierre desde el cliente (best effort; el gateway es la fuente de verdad) |
| POST | `/api/computers/:id/vnc-password` | T | Devuelve la contraseña VNC para copiarla (modo nativo); audita `credential.copy` |
| GET | `/api/computers/:id/screens` | V | Pantallas del equipo con estado de sondeo |
| PUT | `/api/computers/:id/screens` | T | Reemplaza la lista `[{index,label,port,enabled}]`; valida rango 5901-5909, unicidad y máx. 4 |
| POST | `/api/computers/:id/screens/discover` | T | Sondea 5901…5904 y crea/actualiza pantallas (`source=PROBE`); devuelve la lista |

`wsUrl` es relativa: `/vnc-ws?token=<jwt>`; el cliente la convierte a `wss://<host>/vnc-ws?...`.

## Estructura física
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET/POST | `/api/buildings` | V / A | Listar (con plantas anidadas) / crear |
| PATCH/DELETE | `/api/buildings/:id` | A | |
| GET/POST | `/api/floors` | V / A | |
| PATCH/DELETE | `/api/floors/:id` | A | |
| POST | `/api/floors/:id/plan` | A | `multipart/form-data` campo `file`; valida tipo y tamaño, guarda en `UPLOADS_DIR/plans/<floorId>-<timestamp>.<ext>`, actualiza dimensiones |
| GET | `/api/floors/:id/plan` | V | Sirve la imagen (con sesión, `Cache-Control: private, max-age=3600`) |
| GET | `/api/floors/:id/computers` | V | Equipos ubicados en la planta con `state`, posición y datos mínimos (para el mapa) |
| POST | `/api/floors/:id/probe` | T | Sondea todos los equipos de la planta |
| GET/POST | `/api/departments` | V / A | |
| PATCH/DELETE | `/api/departments/:id` | A | |
| GET/POST | `/api/offices` | V / T | Query `floorId` |
| PATCH/DELETE | `/api/offices/:id` | T | Incluye `rect` |

## Importación
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/import/computers/preview` | A | CSV → `{rows:[{line, data, errors[]}], summary}` (no escribe) |
| POST | `/api/import/computers/commit` | A | Mismo CSV + opciones → `SyncRun` tipo CSV |
| POST | `/api/import/structure/preview` · `/commit` | A | Estructura física |

## Administración
| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET/POST | `/api/users` · PATCH `/api/users/:id` | A | |
| POST | `/api/me/password` | V | Cambio de contraseña propia |
| GET/POST | `/api/credentials` · PATCH/DELETE `/api/credentials/:id` | A | Nunca devuelve `passwordEnc` |
| GET | `/api/sync-runs` | T | Últimas ejecuciones |
| POST | `/api/sync/ocs` | T | Encola sincronización (tabla `Setting` key `ocs.requestedAt`; el worker la recoge en ≤ 30 s) |
| GET | `/api/audit` | A | Filtros `userId, action, entity, entityId, from, to` |
| GET | `/api/stats` | V | KPIs del dashboard |

## Comunicación web → worker
Sin cola externa: la web escribe peticiones en `Setting` (`ocs.requestedAt`) o, para sondeos
inmediatos, ejecuta el sondeo **en el propio proceso web** usando la función compartida
`probeComputer()` de `packages/shared` (es una operación corta y acotada por timeout).


---

## CR-01 (specs/10 §6) — rutas nuevas

`/api/import/structure|computers|plans|directory` (preview/commit con las reglas de specs/10 §5),
`/api/import/runs/:id/errors.csv`, `/api/directory` (GET users/suggest, DELETE),
`/api/quality` y `/api/quality/:check.csv`, `POST /api/sessions/:id/identity`.
`PATCH /api/computers/:id` acepta `adUsername`; `GET /api/computers` acepta `check`.
Precedencia: specs/10.
