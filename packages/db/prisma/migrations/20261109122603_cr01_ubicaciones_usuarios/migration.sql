-- AlterTable
ALTER TABLE "Computer" ADD COLUMN     "adUsername" TEXT,
ADD COLUMN     "lastUserNorm" TEXT;

-- AlterTable
ALTER TABLE "RemoteSession" ADD COLUMN     "desktopName" TEXT,
ADD COLUMN     "identityOk" BOOLEAN,
ADD COLUMN     "resolvedBy" TEXT;

-- CreateTable
CREATE TABLE "DirectoryUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "givenName" TEXT,
    "surname" TEXT,
    "department" TEXT,
    "title" TEXT,
    "office" TEXT,
    "phone" TEXT,
    "searchName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'AD_CSV',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryUser_username_key" ON "DirectoryUser"("username");

-- CreateIndex
CREATE INDEX "DirectoryUser_searchName_idx" ON "DirectoryUser"("searchName");

-- CreateIndex
CREATE INDEX "Computer_adUsername_idx" ON "Computer"("adUsername");

-- CreateIndex
CREATE INDEX "Computer_lastUserNorm_idx" ON "Computer"("lastUserNorm");
