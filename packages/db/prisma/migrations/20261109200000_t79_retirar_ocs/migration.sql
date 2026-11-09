-- T-79 (CR-02): retirada de OCS. DESTRUCTIVA: requiere backup pg_dump previo.
-- Los valores 'OCS' de los enums DataSource/SyncType se conservan (filas históricas).
DROP INDEX IF EXISTS "Computer_ocsId_key";
ALTER TABLE "Computer" DROP COLUMN "ocsId",
DROP COLUMN "ocsLastInventory";
