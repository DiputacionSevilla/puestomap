# Actualización de GLPI 10.0.0 → 10.0.28

Salto **dentro de la misma rama 10.0** (el de menor riesgo). Motivo: GLPI 10.0.0 rechaza el
inventario de equipos con disco NVMe (`"NVME" does not match ^(SCSI|HDC|IDE|USB|…)$`) y no recibe
correcciones de seguridad. Último 10.0.x publicado al preparar este documento: **10.0.28**
(<https://github.com/glpi-project/glpi/releases>; confirmar antes de empezar).

> **No ejecutar sin:** snapshot de la VM, copia de la BD verificada y ventana de mantenimiento
> acordada (estimado 30–60 min con GLPI parado para los usuarios).

## 0. Foto previa (solo lectura, desde el PC de administración)

```powershell
python -I extras\glpi-upgrade\check_glpi.py .env antes.json
```

Valores de referencia (2026-11-09, 10.0.0): Computer 145 · Ticket **1777** · User 203 · Location 34 ·
Group 5 · Document 244 · Software 3320 · NetworkEquipment 26 · Printer 18 · Monitor 113 · Entity 1.
Tras actualizar, los recuentos **no pueden bajar** (las incidencias solo pueden subir).

## 1. Reconocimiento en el servidor GLPI (solo lectura)

Servidor: `10.158.1.220` (detrás de un proxy `openresty`; el backend responde como Apache).

```bash
# Dónde está GLPI y quién lo sirve
sudo find / -path '*/front/inventory.php' -not -path '*/proc/*' 2>/dev/null
ps aux | grep -E 'apache2|httpd|nginx|php-fpm' | grep -v grep | head
# Versiones
php -v ; php -m | grep -Ei 'mysqli|curl|gd|intl|mbstring|xml|zip|bz2|opcache|exif|ldap|sodium'
mysql --version        # o mariadb --version
# Configuración sin imprimir contraseñas
sudo sed -E 's/(DBpassword = ).*/\1***/' <RUTA_GLPI>/config/config_db.php
sudo du -sh <RUTA_GLPI>/files <RUTA_GLPI>/plugins <RUTA_GLPI>/marketplace 2>/dev/null
df -h
```

Anotar: `RUTA_GLPI`, usuario del servidor web (`www-data`/`apache`), versión de PHP y de MariaDB/MySQL,
si `files/` está fuera de la ruta (variable `GLPI_VAR_DIR` en `local_define.php`) y el espacio libre.

**Decisión de requisitos:** la 10.0.28 declara su PHP mínimo/máximo en sus notas de versión. Si el PHP
del servidor queda fuera de rango, **parar** y actualizar PHP primero (otro cambio, otra ventana).

## 2. Preparación (sin parar GLPI)

```bash
cd /tmp
curl -LO https://github.com/glpi-project/glpi/releases/download/10.0.28/glpi-10.0.28.tgz
sha256sum glpi-10.0.28.tgz            # contrastar con el hash publicado en la release si existe
sudo mkdir -p /var/www/glpi-nuevo && sudo tar -xzf glpi-10.0.28.tgz -C /var/www/glpi-nuevo --strip-components=1
```

Comprobar requisitos **con el código nuevo** (aún sin tocar el GLPI en producción):

```bash
cd /var/www/glpi-nuevo
sudo -u <USUARIO_WEB> php bin/console glpi:system:check_requirements
```

Debe terminar sin errores (los avisos de extensiones opcionales no bloquean).

## 3. Plugins (importante)

Hoy hay dos plugins activos: `fusioninventory 10.0.0+1.1` y `ocsinventoryng 2.0.0`.
El de FusionInventory no tiene soporte oficial para GLPI 10.0.7+, y el de OCS tiene 0 equipos
enlazados. **Antes de la ventana**, en *Configuración → Plugins* → **Desactivar** ambos
(no desinstalar: se conservan sus tablas y el historial).

Consecuencia asumida: los ~44 agentes FusionInventory que aún contactan **dejan de enviar datos**
hasta que se despliegue el GLPI Agent (ver `extras/glpi-agent/`). Los datos actuales ya se
consideran poco fiables.

No copiar esos dos plugins al GLPI nuevo. Si hay otros en `plugins/`/`marketplace/`, copiarlos.

## 4. Ventana de mantenimiento

```bash
cd <RUTA_GLPI>
sudo -u <USUARIO_WEB> php bin/console glpi:maintenance:enable   # si el comando no existe en 10.0.0, avisar a los usuarios y seguir
```

### 4.1 Copias (obligatorias; no continuar si fallan)

```bash
sudo mkdir -p /root/backup-glpi-$(date +%F) && cd /root/backup-glpi-$(date +%F)
# Base de datos (credenciales desde config_db.php; ejemplo con defaults-extra-file para no exponerlas)
sudo mysqldump --defaults-extra-file=/root/.my-glpi.cnf --single-transaction --routines --triggers <NOMBRE_BD> | gzip > glpi-bd.sql.gz
sudo tar -czf glpi-ficheros.tgz -C <RUTA_GLPI>/.. $(basename <RUTA_GLPI>)
ls -lh ; gzip -t glpi-bd.sql.gz && echo "BD gz OK" ; tar -tzf glpi-ficheros.tgz >/dev/null && echo "ficheros OK"
```

Además: **snapshot de la VM** (la vía de vuelta atrás más rápida).

### 4.2 Sustituir el código

```bash
sudo mv <RUTA_GLPI> <RUTA_GLPI>.10.0.0.bak
sudo mv /var/www/glpi-nuevo <RUTA_GLPI>
# Conservar configuración y datos
sudo cp -a <RUTA_GLPI>.10.0.0.bak/config/. <RUTA_GLPI>/config/
sudo rsync -a <RUTA_GLPI>.10.0.0.bak/files/ <RUTA_GLPI>/files/          # omitir si files/ está fuera de la ruta
sudo cp -a <RUTA_GLPI>.10.0.0.bak/local_define.php <RUTA_GLPI>/ 2>/dev/null || true
sudo chown -R <USUARIO_WEB>: <RUTA_GLPI>
```

**No cambiar la configuración del servidor web** (alias `/glpi`, vhost, proxy) en esta ventana.

### 4.3 Migrar la base de datos

```bash
cd <RUTA_GLPI>
sudo -u <USUARIO_WEB> php bin/console db:update --no-interaction
sudo -u <USUARIO_WEB> php bin/console database:check_schema_integrity   # debe indicar que no hay diferencias
```

Si `db:update` falla: **no reintentar a ciegas**. Guardar la salida y pasar al apartado 7 (vuelta atrás).

### 4.4 Reabrir

```bash
sudo -u <USUARIO_WEB> php bin/console glpi:maintenance:disable
sudo systemctl reload apache2     # o php-fpm; limpiar OPcache si procede
```

## 5. Verificación

Desde el PC de administración:

```powershell
python -I extras\glpi-upgrade\check_glpi.py .env despues.json
```

- `version` = `10.0.28`; Ticket ≥ 1777; Computer 145; User ≥ 203; Document 244; Location 34.
- Entrar en la web con un técnico: lista de incidencias, abrir una, crear una de prueba y cerrarla.
- Confirmar que el portal móvil (`glpi-incidencias-movil`) sigue iniciando sesión y listando.
- *Configuración → Plugins*: FusionInventory y OCS aparecen desactivados y **no** reactivarlos.
- *Configuración → Acciones automáticas*: el cron sigue ejecutándose.
- *Administración → Inventario*: **Activar inventario** marcado.

## 6. Repetir la prueba del agente (este PC)

Abrir `http://localhost:62354` en `AYUOAC006` → **Force an Inventory**. Esperado: ya no aparece el error
`NVME`, y en GLPI se crea la ficha del equipo con IP, serie, SO, discos y software.
Después, seguir con el piloto de `extras/glpi-agent/`.

## 7. Vuelta atrás (si algo falla antes de reabrir)

1. Parar el servidor web. 2. Restaurar el directorio: `mv <RUTA_GLPI> <RUTA_GLPI>.fallido && mv <RUTA_GLPI>.10.0.0.bak <RUTA_GLPI>`.
3. Restaurar la BD: `zcat glpi-bd.sql.gz | mysql <NOMBRE_BD>` (sobre BD vacía recreada) **o** revertir el snapshot de la VM.
4. Reactivar los plugins desactivados. 5. Verificar con `check_glpi.py` que vuelve a 10.0.0 y 1777 incidencias.

Las incidencias creadas durante la ventana se pierden al revertir: por eso la ventana es corta y avisada.

## 8. Después

- Conservar `<RUTA_GLPI>.10.0.0.bak` y las copias al menos 2 semanas.
- Valorar más adelante pasar a una rama superior de GLPI (hay versiones posteriores a la 10.0): solo cuando
  FusionInventory/OCS estén retirados y el portal móvil probado contra esa versión.

## Registro de la ejecución (2026-11-09)

Ejecutada por Claude Code con SSH autorizado por el responsable. Servidor `glpi-ocs` (10.158.1.220):
Ubuntu 20.04, Apache 2.4.41, PHP 7.4.3, MySQL 8.0.42.

- **Disposición real:** código en `/var/www/glpi` (Apache `Alias /glpi`), configuración y clave de cifrado
  en `/etc/glpi` (vía `inc/downstream.php`, que **hay que recuperar de la versión anterior** porque el
  paquete nuevo no lo trae), datos en `/var/lib/glpi`, logs en `/var/log/glpi`. No hay `config/` ni `files/` dentro del código.
- **Contraseña de BD:** en `config_db.php` está codificada solo con `rawurlencode` (no base64).
- **Resultado:** 10.0.0 → **10.0.28**; `database:update` 20 s sin errores; integridad del esquema correcta;
  recuentos idénticos antes/después (Ticket 1777, Computer 145, User 203, Document 244, Location 34).
  Parada efectiva ≈ 2 min (18:12–18:14). Plugins FusionInventory y OCS desactivados y **no** copiados al código nuevo.
- **Copias:** `~/backup-glpi-2026-11-09-1808` y `~/backup-glpi-final-2026-11-09-1812`; versión anterior en
  `/var/www/glpi.10.0.0.bak`. Conservar al menos 2 semanas.
- **Comprobación del agente:** GLPI Agent 1.21 en `AYUOAC006` → ficha creada (id 147) con IP, serie, SO,
  7 discos y 207 programas; antes de actualizar fallaba con `"NVME" does not match …`.
- **Pendiente:** revisar ACL de perfiles (derechos nuevos `agent`, `refusedequipment`…), cambiar la contraseña
  de `fjcarrion`, retirar la clave pública de Claude de su `authorized_keys`, planificar el salto de Ubuntu/PHP.
