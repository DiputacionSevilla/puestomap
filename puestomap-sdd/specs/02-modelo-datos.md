# 02 — Modelo de datos

## 1. Esquema Prisma (punto de partida obligatorio)

El agente puede añadir índices o campos técnicos menores (con ADR), pero no eliminar ni renombrar.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role          { ADMIN TECH VIEWER }
enum TriState      { YES NO UNKNOWN }
enum DataSource    { OCS CSV MANUAL }
enum SessionMode   { WEB NATIVE }
enum SessionStatus { PENDING ACTIVE ENDED FAILED EXPIRED }
enum SyncType      { OCS PROBE CSV }
enum SyncStatus    { RUNNING OK PARTIAL ERROR }

model User {
  id            String          @id @default(cuid())
  username      String          @unique
  name          String
  email         String?
  passwordHash  String
  role          Role            @default(TECH)
  active        Boolean         @default(true)
  failedLogins  Int             @default(0)
  lockedUntil   DateTime?
  lastLoginAt   DateTime?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  sessions      RemoteSession[]
  audits        AuditLog[]
}

model Building {
  id        String   @id @default(cuid())
  code      String   @unique          // p. ej. "CASA-CONSIST"
  name      String
  address   String?
  sortOrder Int      @default(0)
  floors    Floor[]
}

model Floor {
  id          String     @id @default(cuid())
  buildingId  String
  building    Building   @relation(fields: [buildingId], references: [id], onDelete: Restrict)
  name        String                // "Planta baja", "Primera"
  level       Int        @default(0)
  planFile    String?               // ruta relativa dentro de UPLOADS_DIR
  planWidth   Int?                  // px de la imagen original
  planHeight  Int?
  offices     Office[]
  computers   Computer[]
  @@unique([buildingId, name])
}

model Department {
  id        String     @id @default(cuid())
  code      String     @unique
  name      String
  offices   Office[]
  computers Computer[]
}

model Office {
  id           String      @id @default(cuid())
  floorId      String
  floor        Floor       @relation(fields: [floorId], references: [id], onDelete: Restrict)
  departmentId String?
  department   Department? @relation(fields: [departmentId], references: [id])
  code         String                 // "P1-07"
  name         String                 // "Despacho Intervención"
  rect         Json?                  // {x,y,w,h} normalizados 0..1 (opcional)
  computers    Computer[]
  @@unique([floorId, code])
}

model VncCredential {
  id           String     @id @default(cuid())
  name         String     @unique     // "Estándar 2024"
  passwordEnc  String                 // AES-256-GCM base64 (iv:tag:cipher)
  isDefault    Boolean    @default(false)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  computers    Computer[]
}

model Computer {
  id               String         @id @default(cuid())
  // Identidad
  hostname         String         @unique   // en MAYÚSCULAS, normalizado
  ocsId            Int?           @unique
  externalRef      String?                  // reservado GLPI
  assetTag         String?
  serial           String?
  source           DataSource     @default(MANUAL)
  archived         Boolean        @default(false)
  // Red
  ip               String?
  mac              String?
  domain           String?
  // Hardware / SO (desde OCS)
  manufacturer     String?
  model            String?
  os               String?
  osVersion        String?
  cpu              String?
  ramMb            Int?
  diskGb           Int?
  lastUser         String?                  // último usuario logado (OCS USERID)
  ocsLastInventory DateTime?
  // Datos de gestión (manuales, nunca los pisa OCS)
  assignedTo       String?                  // persona responsable del puesto
  phoneExt         String?
  notes            String?
  // Ubicación (manual)
  floorId          String?
  floor            Floor?         @relation(fields: [floorId], references: [id])
  officeId         String?
  office           Office?        @relation(fields: [officeId], references: [id])
  departmentId     String?
  department       Department?    @relation(fields: [departmentId], references: [id])
  posX             Float?                   // 0..1 sobre el ancho del plano
  posY             Float?                   // 0..1 sobre el alto del plano
  // VNC
  vncInstalled     TriState       @default(UNKNOWN)
  vncInstalledSrc  String?                  // "OCS" | "PROBE" | "MANUAL"
  vncVersion       String?
  vncPort          Int            @default(5900)
  vncOverride      TriState?                // fuerza manual del estado instalado
  credentialId     String?
  credential       VncCredential? @relation(fields: [credentialId], references: [id])
  // Estado en vivo (sondeo)
  online           Boolean?
  vncReachable     Boolean?
  rfbVersion       String?
  lastProbeAt      DateTime?
  lastSeenAt       DateTime?                // último sondeo con respuesta
  lastVncOkAt      DateTime?                // último banner RFB correcto
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  monitorCount     Int?                     // nº de monitores según OCS (solo pista, ver 09)
  screens          ComputerScreen[]
  sessions         RemoteSession[]
  @@index([ip])
  @@index([floorId])
  @@index([departmentId])
  @@index([lastUser])
}

model ComputerScreen {
  id          String    @id @default(cuid())
  computerId  String
  computer    Computer  @relation(fields: [computerId], references: [id], onDelete: Cascade)
  index       Int                      // 1..4
  label       String                   // "Pantalla 1" (editable: "Izquierda")
  port        Int                      // 5900 + index por defecto; rango 5901-5909
  source      String    @default("MANUAL")   // "PROBE" | "MANUAL"
  enabled     Boolean   @default(true)
  reachable   Boolean?
  lastProbeAt DateTime?
  lastOkAt    DateTime?
  @@unique([computerId, index])
  @@unique([computerId, port])
}

model RemoteSession {
  id          String        @id @default(cuid())
  computerId  String
  computer    Computer      @relation(fields: [computerId], references: [id])
  userId      String
  user        User          @relation(fields: [userId], references: [id])
  mode        SessionMode
  status      SessionStatus @default(PENDING)
  reason      String?                    // nº de incidencia / motivo
  targetIp    String?                    // IP usada en la conexión (histórico)
  clientIp    String?
  createdAt   DateTime      @default(now())
  startedAt   DateTime?
  endedAt     DateTime?
  bytesIn     BigInt        @default(0)
  bytesOut    BigInt        @default(0)
  endReason   String?                    // "client_closed" | "idle_timeout" | "target_error" …
  targetPort  Int?                       // puerto VNC usado (5900 = escritorio completo)
  screenId    String?                    // ComputerScreen usada (null = escritorio completo)
  screenLabel String?
  groupId     String?                    // agrupa las sesiones abiertas a la vez (multipantalla)
  @@index([groupId])
  @@index([computerId, createdAt])
  @@index([status])
}

model SyncRun {
  id         String     @id @default(cuid())
  type       SyncType
  status     SyncStatus @default(RUNNING)
  startedAt  DateTime   @default(now())
  finishedAt DateTime?
  stats      Json?                       // {created, updated, unchanged, errors, …}
  error      String?
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  action    String                     // "computer.move", "session.start", "auth.login" …
  entity    String?
  entityId  String?
  data      Json?
  ip        String?
  createdAt DateTime @default(now())
  @@index([entity, entityId])
  @@index([createdAt])
}

model Setting {
  key   String @id                     // "ocs.lastSyncAt", "probe.ports" …
  value Json
}
```

## 2. Reglas de datos

| ID | Regla |
|---|---|
| DM-1 | `hostname` se guarda normalizado: `trim().toUpperCase()`. Es la clave de casación entre fuentes cuando no hay `ocsId`. |
| DM-2 | La sincronización OCS **solo** escribe campos de los bloques Identidad (salvo `assetTag`), Red, Hardware/SO y `vncVersion`/`vncInstalled` cuando la fuente sea OCS. Jamás toca Gestión ni Ubicación. |
| DM-3 | `posX`/`posY` solo tienen sentido con `floorId`. Si cambia `floorId`, se ponen a `null` salvo que la operación aporte nuevas coordenadas. |
| DM-4 | Si `officeId` se informa, `floorId` debe coincidir con `office.floorId` y, si el despacho tiene departamento y el equipo no, se hereda `departmentId`. |
| DM-5 | Solo puede haber un `VncCredential` con `isDefault = true`. Un equipo sin `credentialId` usa la credencial por defecto. |
| DM-6 | Un equipo que deja de aparecer en OCS **no** se borra: se mantiene y la UI lo marca "No visto en OCS > 30 días". Archivar es manual. |
| DM-7 | Coordenadas normalizadas: `posX = x_px / planWidth`, `posY = y_px / planHeight`, con origen arriba-izquierda. |
| DM-8 | Seed de desarrollo: 1 ADMIN (`ADMIN_INITIAL_USER`/`ADMIN_INITIAL_PASSWORD`), 2 edificios, 3 plantas con plano de ejemplo generado (SVG simple), 4 departamentos, 8 despachos, 40 equipos con estados variados. |

## 3. Estado VNC derivado (para UI y filtros)

Se calcula en `packages/shared/vnc-status.ts` (función pura `deriveVncState`):

| Estado UI | Condición (en este orden) | Color pin |
|---|---|---|
| `READY` | `online = true` y `vncReachable = true` | verde |
| `NOT_LISTENING` | `online = true`, `vncReachable = false` y instalado efectivo ≠ `NO` | ámbar |
| `NOT_INSTALLED` | instalado efectivo = `NO` | rojo |
| `OFFLINE` | `online = false` | gris |
| `UNKNOWN` | resto (nunca sondeado) | gris claro con borde discontinuo |

"Instalado efectivo" = `vncOverride ?? vncInstalled`.

Cálculo de `vncInstalled` (worker, tras cada sync/sondeo):
1. Si hay `lastVncOkAt` en los últimos 30 días → `YES` (src `PROBE`).
2. Si no, si el inventario OCS (≤ 30 días) contiene un software que coincide con `/tightvnc/i` → `YES` (src `OCS`).
3. Si no, si el inventario OCS es reciente (≤ 30 días), no contiene TightVNC **y** el último sondeo con `online = true` obtuvo conexión rechazada en el puerto VNC → `NO`.
4. En otro caso → `UNKNOWN`.
