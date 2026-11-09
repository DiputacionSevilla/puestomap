-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TECH', 'VIEWER');

-- CreateEnum
CREATE TYPE "TriState" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('OCS', 'CSV', 'MANUAL');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('WEB', 'NATIVE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('OCS', 'PROBE', 'CSV');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'OK', 'PARTIAL', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TECH',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "planFile" TEXT,
    "planWidth" INTEGER,
    "planHeight" INTEGER,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "departmentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rect" JSONB,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VncCredential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VncCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Computer" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "ocsId" INTEGER,
    "externalRef" TEXT,
    "assetTag" TEXT,
    "serial" TEXT,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "mac" TEXT,
    "domain" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "os" TEXT,
    "osVersion" TEXT,
    "cpu" TEXT,
    "ramMb" INTEGER,
    "diskGb" INTEGER,
    "lastUser" TEXT,
    "ocsLastInventory" TIMESTAMP(3),
    "assignedTo" TEXT,
    "phoneExt" TEXT,
    "notes" TEXT,
    "floorId" TEXT,
    "officeId" TEXT,
    "departmentId" TEXT,
    "posX" DOUBLE PRECISION,
    "posY" DOUBLE PRECISION,
    "vncInstalled" "TriState" NOT NULL DEFAULT 'UNKNOWN',
    "vncInstalledSrc" TEXT,
    "vncVersion" TEXT,
    "vncPort" INTEGER NOT NULL DEFAULT 5900,
    "vncOverride" "TriState",
    "credentialId" TEXT,
    "online" BOOLEAN,
    "vncReachable" BOOLEAN,
    "rfbVersion" TEXT,
    "lastProbeAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "lastVncOkAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "monitorCount" INTEGER,

    CONSTRAINT "Computer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputerScreen" (
    "id" TEXT NOT NULL,
    "computerId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reachable" BOOLEAN,
    "lastProbeAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),

    CONSTRAINT "ComputerScreen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemoteSession" (
    "id" TEXT NOT NULL,
    "computerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "SessionMode" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "targetIp" TEXT,
    "clientIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,
    "endReason" TEXT,
    "targetPort" INTEGER,
    "screenId" TEXT,
    "screenLabel" TEXT,
    "groupId" TEXT,

    CONSTRAINT "RemoteSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "type" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Building_code_key" ON "Building"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_buildingId_name_key" ON "Floor"("buildingId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Office_floorId_code_key" ON "Office"("floorId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "VncCredential_name_key" ON "VncCredential"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Computer_hostname_key" ON "Computer"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "Computer_ocsId_key" ON "Computer"("ocsId");

-- CreateIndex
CREATE INDEX "Computer_ip_idx" ON "Computer"("ip");

-- CreateIndex
CREATE INDEX "Computer_floorId_idx" ON "Computer"("floorId");

-- CreateIndex
CREATE INDEX "Computer_departmentId_idx" ON "Computer"("departmentId");

-- CreateIndex
CREATE INDEX "Computer_lastUser_idx" ON "Computer"("lastUser");

-- CreateIndex
CREATE UNIQUE INDEX "ComputerScreen_computerId_index_key" ON "ComputerScreen"("computerId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "ComputerScreen_computerId_port_key" ON "ComputerScreen"("computerId", "port");

-- CreateIndex
CREATE INDEX "RemoteSession_groupId_idx" ON "RemoteSession"("groupId");

-- CreateIndex
CREATE INDEX "RemoteSession_computerId_createdAt_idx" ON "RemoteSession"("computerId", "createdAt");

-- CreateIndex
CREATE INDEX "RemoteSession_status_idx" ON "RemoteSession"("status");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Computer" ADD CONSTRAINT "Computer_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Computer" ADD CONSTRAINT "Computer_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Computer" ADD CONSTRAINT "Computer_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Computer" ADD CONSTRAINT "Computer_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "VncCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputerScreen" ADD CONSTRAINT "ComputerScreen_computerId_fkey" FOREIGN KEY ("computerId") REFERENCES "Computer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteSession" ADD CONSTRAINT "RemoteSession_computerId_fkey" FOREIGN KEY ("computerId") REFERENCES "Computer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteSession" ADD CONSTRAINT "RemoteSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

