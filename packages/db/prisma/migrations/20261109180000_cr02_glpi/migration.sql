-- CR-02 (specs/11): GLPI como fuente de verdad. Migración aditiva.

-- AlterEnum
ALTER TYPE "DataSource" ADD VALUE IF NOT EXISTS 'GLPI';
ALTER TYPE "SyncType" ADD VALUE IF NOT EXISTS 'GLPI';

-- AlterTable
ALTER TABLE "Building" ADD COLUMN "glpiLocationId" INTEGER;
ALTER TABLE "Floor" ADD COLUMN "glpiLocationId" INTEGER;
ALTER TABLE "Office" ADD COLUMN "glpiLocationId" INTEGER;
ALTER TABLE "Computer" ADD COLUMN "glpiId" INTEGER,
ADD COLUMN "glpiSyncedAt" TIMESTAMP(3),
ADD COLUMN "glpiState" TEXT,
ADD COLUMN "glpiUserName" TEXT,
ADD COLUMN "lastInventoryAt" TIMESTAMP(3);
ALTER TABLE "DirectoryUser" ADD COLUMN "glpiUserId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Building_glpiLocationId_key" ON "Building"("glpiLocationId");
CREATE UNIQUE INDEX "Floor_glpiLocationId_key" ON "Floor"("glpiLocationId");
CREATE UNIQUE INDEX "Office_glpiLocationId_key" ON "Office"("glpiLocationId");
CREATE UNIQUE INDEX "Computer_glpiId_key" ON "Computer"("glpiId");
CREATE UNIQUE INDEX "DirectoryUser_glpiUserId_key" ON "DirectoryUser"("glpiUserId");
