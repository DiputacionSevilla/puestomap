# Correcciones al procedimiento (prevalecen sobre `PROCEDIMIENTO_GLPI12_DOCKER.md`)

Revisión del 2026-11-10 frente al servidor real `glpi-ocs` (10.158.1.220: Ubuntu 20.04, Apache 2.4.41,
PHP 7.4.3, **MySQL 8.0.42**, 2 vCPU, 2,9 GB RAM, 20 GB de disco con 5,9 GB libres).

1. **Motor:** el origen es MySQL 8.0, no MariaDB. El compose usa `mysql:8.0` (GLPI 12 lo admite) para no
   cambiar de motor al restaurar. Donde el procedimiento dice `mariadb`, `mariadb-dump`, `MARIADB_*`,
   usar `mysql`, `mysqldump` y `MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE` dentro del contenedor `db`.
   Verificar el volcado: sin `utf8mb4_0900_ai_ci`; si aparece, convertir antes de restaurar.
2. **Migraciones previas: ya hechas** (Fase A, 2026-11-10). `config_db.php` tiene `use_utf8mb4`, sin MyISAM,
   sin `datetime` y sin claves con signo; la BD tiene 477 tablas InnoDB `utf8mb4_unicode_ci` en formato Dynamic
   (+4 MEMORY, normales) y 0 columnas `datetime`. No hace falta ejecutar `migration:*`; solo comprobarlo en la
   copia de staging con `database:check_schema_integrity` antes de `database:update`.
3. **Rutas reales:** configuración y `glpicrypt.key` en `/etc/glpi` (config_db.php, glpicrypt.key,
   local_define.php), datos en `/var/lib/glpi`, logs en `/var/log/glpi`, código en `/var/www/glpi`
   (Apache `Alias /glpi`). No existe `/var/www/glpi/files`. Copia previa verificada: `~/backup-glpi-final-2026-11-09-1812`
   (contiene `glpicrypt.key`).
4. **Memoria:** `mem_limit` en los contenedores, buffer pool de 128 MB y sin `restart` (ver `compose.yaml`).
   Con 1,7 GB libres, si el staging agota la RAM Linux puede matar el MySQL de producción: vigilar
   `free -h` y parar el staging si baja de ~600 MB. Alternativa preferida: ensayar directamente en la VM nueva.
5. **sudo:** `fjcarrion` necesita contraseña para `sudo`; no se usa `NOPASSWD`.
6. El fichero de ejemplo es `.env.example` (el texto dice `env.example`). Confirmar la etiqueta
   `glpi/glpi:12.0.1` y los nombres de variables de la imagen antes de arrancar.

## Puntos que el procedimiento no cubre (decidir antes del corte)

- **Ruta `/glpi`:** agentes y PuestoMap usan `https://soporte.mairenadelalcor.net/glpi/...`. La imagen sirve en
  la raíz y GLPI 11/12 usa `public/`. O bien el proxy mapea `/glpi/` → contenedor, o hay que cambiar el servidor
  de los agentes y `GLPI_URL` de PuestoMap.
- **API de PuestoMap:** usa `apirest.php` v1; probar contra la instancia nueva (sesión, listados,
  `Computer/{id}/Computer_Item`, `Item_OperatingSystem`, PUT de ubicación).
- **Inventario de agentes:** GLPI 12 exige elegir autenticación; los agentes actuales envían sin autenticar.
  Comprobar soporte de OAuth en GLPI Agent 1.21 antes de seguir con el despliegue masivo.
- **Limpieza y PuestoMap:** los equipos en estado «Inventario anterior» no están en la papelera y PuestoMap
  los importa. Añadir un filtro por estado o por última actualización al sync (T-nuevo).
- **Plugins:** confirmar que no hay otros además de FusionInventory y OCS (ambos desactivados).

## Resultado de la Fase A (solo lectura, 2026-11-10) — Puerta A: APTO con reservas

- MySQL 8.0.42 en localhost (3306 solo en 127.0.0.1), base `glpi` de **350 MB**, 481 tablas. Apache en el puerto 80
  con `Alias /glpi`; no hay GLPI ni MySQL en Docker (solo un contenedor `ocsinventory-db` detenido, ajeno a esta tarea).
- **Docker 24.0.5 está instalado pero sin el plugin `docker compose`**: hay que instalarlo (apt, repositorio de Docker)
  o usar otra vía; es un cambio en el host de producción que requiere autorización.
- Plugins registrados en `glpi_plugins`: **ninguno**. API REST activa (credenciales y token externo), `url_base` con `/glpi`.
- Recuentos de referencia: tickets 1802, seguimientos 414, tareas 3, documentos 244 (581 enlaces), usuarios 192,
  entidades 1, perfiles 8, ordenadores 155 (153 activos, 1 en papelera, 1 plantilla), impresoras 18, red 32,
  monitores 118, contratos 7, proveedores 5, lugares 34, agentes 11, LDAP 1, recolector de correo 1.
- **Ordenadores:** 138 de los 153 activos no se actualizan desde hace más de 180 días y **`glpi_items_tickets` está
  vacía: ningún ticket enlaza ningún ordenador** (el grupo «H» del procedimiento es, a efectos de tickets, vacío).
  Comprobar aún otros vínculos (software instalado, documentos, contratos, redes) antes de papelera/borrado.
- Recolector de correo y LDAP existen: en staging mantener cron desactivado para que no se descargue correo.
