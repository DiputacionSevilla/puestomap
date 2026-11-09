# 08 — Tests mínimos

Objetivo: el **mínimo** que garantiza la puesta en marcha y protege las partes críticas
(seguridad de la conexión, cálculo de estado, integración OCS). No se persigue cobertura.
Todos los tests de `npm test` corren **sin red externa ni Docker** (TCP solo en `127.0.0.1`).

## 1. Unitarios (Vitest) — `packages/shared`

| ID | Módulo | Casos |
|---|---|---|
| T-U1 | `crypto` | cifrar/descifrar ida y vuelta; texto manipulado → error; clave incorrecta → error |
| T-U2 | `token` | firmar/verificar; caducado → error; firma con otro secreto → error |
| T-U3 | `cidr` | IP dentro/fuera de varias redes; entrada inválida |
| T-U4 | `rfb` | `parseRfbBanner`: `RFB 003.008\n` OK, `RFB 003.003\n` OK, basura → null, longitud corta → null |
| T-U5 | `vnc-status` | tabla de decisión de 02 §3: un caso por estado UI + override manual + las 4 reglas de `vncInstalled` |
| T-U6 | `geo` | `toLatLng`/`fromLatLng` ida y vuelta y esquinas (0,0) y (1,1) |
| T-U7 | `hostname` | normalización (espacios, minúsculas) |

## 2. Unitarios — `apps/worker` y `apps/web`

| ID | Módulo | Casos |
|---|---|---|
| T-U8 | `ocs/mapper` | fixture OCS → `ComputerUpsert` esperado; detección de TightVNC; IP de respaldo desde `networks`; equipo sin software |
| T-U9 | `sync/merge` | la sincronización no sobrescribe campos manuales (DM-2) |
| T-U10 | `import/computers` | CSV válido → filas OK; hostname vacío, despacho de otra planta y coordenadas fuera de rango → errores por fila; celda vacía no borra |

## 3. Integración (Vitest, TCP local)

| ID | Qué | Casos |
|---|---|---|
| T-I1 | `probeComputer` | servidor TCP falso que envía `RFB 003.008\n` → `vncReachable=true`; puerto cerrado → `refused`, `online=true`; servidor que no responde + puertos online cerrados → `online=false` (timeout corto) |
| T-I2 | Gateway | servidor RFB falso + `createGateway` con `sessionStore` en memoria + cliente `ws`: (a) token válido → recibe el banner y el eco de bytes; (b) token inválido → cierre 4401; (c) mismo token dos veces → segundo 4409; (d) destino fuera de CIDR → 4403; (e) `Origin` incorrecto → 4403; (f) al cerrar el cliente se llama `finish` con bytes > 0 |
| T-I3 | API sesiones | handler `POST /api/computers/:id/sessions` con BD mockeada (o Prisma contra Postgres de `docker-compose.dev.yml` en `test:db`, opcional): VIEWER → 403; sesión activa de otro usuario → 409; TECH → 200 con `wsUrl` y sin exponer `passwordEnc` |

## 4. E2E smoke (Playwright) — `npm run test:e2e`

Se ejecuta contra el entorno levantado con datos de seed (no forma parte de `verify`).

| ID | Flujo |
|---|---|
| T-E1 | Login admin → dashboard muestra KPIs → Equipos: buscar un hostname del seed → abrir ficha → "Ver en plano" muestra el mapa con el marcador resaltado |

## 5. Verificación manual de aceptación (checklist en `docs/progress.md`)

Con red real, antes de dar por cerrada la v1:
1. Sincronización OCS completa sin errores y número de equipos coherente con OCS.
2. Sondeo: al menos un equipo en cada estado (`READY`, `NOT_LISTENING`, `OFFLINE`).
3. Asistencia web a un equipo real: conectar, Ctrl+Alt+Supr, pantalla completa, desconectar; sesión registrada con bytes.
4. Asistencia nativa con el protocolo `tightvnc://` desde el PC de cada técnico.
5. Ubicar 5 equipos en un plano por arrastre y comprobar que persisten tras recargar.
6. Importar un CSV de estructura y otro de equipos.

## 6. Multipantalla (añadidos al mínimo)

| ID | Qué | Casos |
|---|---|---|
| T-U11 | `shared/screens` | `deriveMultiState` (SINGLE / MULTI_OK / MULTI_PENDING); validación de puertos (rango, duplicados, máx. 4); mapper OCS cuenta `monitors` |
| T-I2 (g) | Gateway | la conexión usa el `targetPort` de la sesión; `targetPort` fuera de `VNC_ALLOWED_PORTS` → 4403 |
| T-I4 | Descubrimiento | dos servidores RFB falsos en puertos distintos → se crean 2 `ComputerScreen`; uno deja de responder → la pantalla `PROBE` se deshabilita tras el plazo; las `MANUAL` no se tocan |
