set -o pipefail
L(){ echo "[$(date +%H:%M:%S)] $*"; }
LAP=$(date +%s); T0=$LAP
lap(){ n=$(date +%s); echo "      >> $1: $((n-LAP)) s"; LAP=$n; }
abort(){ L "ABORTO: $*"; echo "      GLPI 10 queda en mantenimiento. Para volver atras: bash /opt/glpi12-migracion/scripts/rollback-corte.sh"; exit 1; }
SRC=/opt/glpi12-migracion; BK=/var/backups/glpi-migracion; TS=$(date +%Y%m%d-%H%M)
MYQ='mysql -uroot -p"$MYSQL_ROOT_PASSWORD" glpi -N -B 2>/dev/null'
COUNTS="select 'tickets',count(*) from glpi_tickets union all select 'seguimientos',count(*) from glpi_itilfollowups union all select 'documentos',count(*) from glpi_documents union all select 'usuarios',count(*) from glpi_users union all select 'equipos_activos',count(*) from glpi_computers where is_deleted=0 union all select 'monitores',count(*) from glpi_monitors union all select 'lugares',count(*) from glpi_locations"

L "A0: comprobaciones previas"
AV=$(df --output=avail -m / | tail -1 | tr -d ' '); echo "      disco libre: ${AV} MB"; [ "$AV" -gt 1200 ] || abort "disco insuficiente"
cd $SRC || abort "no existe $SRC"
echo "$TS" > /tmp/corte_ts

L "A1: guardar config de correo del staging (valores cifrados) y datos de marcha atras"
docker compose exec -T db sh -c "$MYQ -e \"select concat('update glpi_configs set value=',quote(value),' where context=\\\"core\\\" and name=',quote(name),';') from glpi_configs where context='core' and name in ('smtp_username','smtp_passwd','admin_email')\"" > $BK/.cfgmail_$TS.sql
chmod 600 $BK/.cfgmail_$TS.sql; [ "$(wc -l < $BK/.cfgmail_$TS.sql)" = "3" ] || abort "no se pudo leer la config de correo del staging"
mysql glpi -N -B -e "select 'task',name,state from glpi_crontasks where name in ('mailgate','queuednotification'); select 'cfg',name,value from glpi_configs where context='core' and name in ('maintenance_mode','maintenance_text')" 2>/dev/null > $BK/rollback_glpi10_$TS.tsv
chmod 600 $BK/rollback_glpi10_$TS.tsv; echo "      estado previo de GLPI 10 guardado: $(wc -l < $BK/rollback_glpi10_$TS.tsv) lineas"
sha256sum /etc/glpi/glpicrypt.key $SRC/data/glpi/config/glpicrypt.key | awk '{print $1}' | uniq | wc -l | sed 's/^/      claves distintas (debe ser 1): /'
[ "$(sha256sum /etc/glpi/glpicrypt.key $SRC/data/glpi/config/glpicrypt.key | awk '{print $1}' | uniq | wc -l)" = "1" ] || abort "glpicrypt.key distinta"
lap "preparacion"

L "A2: GLPI 10 EN MANTENIMIENTO y recolector de correo parado"
mysql glpi -e "insert into glpi_configs (context,name,value) values ('core','maintenance_mode','1') on duplicate key update value='1'; insert into glpi_configs (context,name,value) values ('core','maintenance_text','Mantenimiento programado: migracion a GLPI 12. Vuelva en unos minutos.') on duplicate key update value=values(value); update glpi_crontasks set state=0 where name in ('mailgate','queuednotification');" 2>/dev/null || abort "no se pudo activar el mantenimiento"
echo "      respuesta de GLPI 10 ahora: $(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1/glpi/front/ticket.php)"
sleep 15
lap "mantenimiento y espera de peticiones en curso"

L "A3: copia final de GLPI 10 (solo lectura) con hashes"
mysql glpi -N -B -e "$COUNTS" 2>/dev/null > /tmp/cnt_prod.tsv
mysqldump --single-transaction --routines --triggers --events --no-tablespaces glpi 2>/tmp/dump.err | gzip > $BK/corte_origen_$TS.sql.gz || { head -3 /tmp/dump.err; abort "fallo el volcado"; }
gunzip -t $BK/corte_origen_$TS.sql.gz || abort "volcado corrupto"
tar -C /var/lib/glpi -czf $BK/corte_varlib_$TS.tgz . 2>/dev/null
tar -C /etc/glpi -czf $BK/corte_etc_$TS.tgz . 2>/dev/null
( cd $BK && sha256sum corte_origen_$TS.sql.gz corte_varlib_$TS.tgz corte_etc_$TS.tgz > SHA256SUMS_corte_$TS && sha256sum -c SHA256SUMS_corte_$TS | sed 's/^/      /' )
ls -la $BK/corte_origen_$TS.sql.gz | awk '{print "      volcado: "$5" bytes"}'
lap "copia final"

L "A4: parar el staging y restaurar en su BD (se recrea la base 'glpi' del staging)"
docker compose stop glpi proxy 2>&1 | grep -vi swap | tail -2
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "drop database glpi; create database glpi character set utf8mb4 collate utf8mb4_unicode_ci" 2>/dev/null' || abort "no se pudo recrear la base del staging"
gunzip -c $BK/corte_origen_$TS.sql.gz | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" glpi 2>/dev/null' || abort "fallo la restauracion"
echo "      restauracion OK"
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "grant all on glpi.* to \"glpi\"@\"%\"" 2>/dev/null' >/dev/null 2>&1
mv data/glpi/files data/glpi/files.staging-previo-$TS && mkdir data/glpi/files && tar -C data/glpi/files -xzf $BK/corte_varlib_$TS.tgz 2>/dev/null; chown -R 33:33 data/glpi
lap "restauracion de BD y ficheros"

L "A5: arrancar GLPI 12 (cron APAGADO) y actualizar esquema"
GLPI_CRONTAB_ENABLED=0 docker compose up -d glpi 2>&1 | grep -vi swap | tail -1
n=0; until docker compose exec -T glpi sh -c 'test -f /var/www/glpi/bin/console' 2>/dev/null || [ $n -ge 30 ]; do sleep 2; n=$((n+1)); done
docker compose exec -T -u www-data glpi php bin/console database:update --no-interaction 2>&1 | tail -4
docker compose exec -T -u www-data glpi php bin/console database:check_schema_integrity --no-interaction 2>&1 | tail -2
lap "database:update"

L "A6: configuracion del corte"
cat > /tmp/post.sql <<'SQL'
update glpi_configs set value='https://soporte.mairenadelalcor.net' where context='core' and name='url_base';
update glpi_configs set value='none' where context='inventory' and name='auth_required';
update glpi_configs set value='0' where context='core' and name='maintenance_mode';  -- la copia hereda el mantenimiento puesto en GLPI 10
update glpi_configs set value=1 where context='core' and name in ('use_notifications','notifications_mailing');
select 'avisos_atrasados_a_borrar', count(*) from glpi_queuednotifications where sent_time is null;
delete from glpi_queuednotifications where sent_time is null;
select 'avisos_sin_enviar_restantes', count(*) from glpi_queuednotifications where sent_time is null;
update glpi_crontasks set state=0;
update glpi_crontasks set state=1 where name in ('queuednotification','queuednotificationclean','mailgate');
SQL
cat $BK/.cfgmail_$TS.sql >> /tmp/post.sql
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" glpi -N 2>/dev/null' < /tmp/post.sql
rm -f /tmp/post.sql
shred -u $BK/.cfgmail_$TS.sql 2>/dev/null || rm -f $BK/.cfgmail_$TS.sql
lap "configuracion"

L "A7: nginx de GLPI 12 en la IP del servidor, puerto 8080"
grep -q '^PROXY_BIND_IP=' .env && sed -i -E 's/^PROXY_BIND_IP=.*/PROXY_BIND_IP=10.158.1.220/' .env || echo 'PROXY_BIND_IP=10.158.1.220' >> .env
grep -q '^PROXY_HOST_PORT=' .env && sed -i -E 's/^PROXY_HOST_PORT=.*/PROXY_HOST_PORT=8080/' .env || echo 'PROXY_HOST_PORT=8080' >> .env
GLPI_CRONTAB_ENABLED=0 docker compose up -d --no-deps proxy 2>&1 | grep -vi swap | tail -1
sleep 5
H='-H Host:soporte.mairenadelalcor.net -H X-Forwarded-Proto:https'
echo "      web  http://10.158.1.220:8080/            -> $(curl -s -m 20 $H -o /dev/null -w '%{http_code}' http://10.158.1.220:8080/)"
echo "      API  /glpi/apirest.php/                   -> $(curl -s -m 20 $H -o /dev/null -w '%{http_code}' http://10.158.1.220:8080/glpi/apirest.php/)"
echo "      inventario /glpi/front/inventory.php      -> $(curl -s -m 20 $H -X POST -H 'Content-Type: application/json' -d '{"action":"contact","deviceid":"corte-prolog-0001","query":"PROLOG"}' http://10.158.1.220:8080/glpi/front/inventory.php | cut -c1-80)"
echo "      /glpi/ redirige a: $(curl -s -m 20 $H -D - -o /dev/null http://10.158.1.220:8080/glpi/ | grep -i '^location' | tr -d '\r')"
lap "nginx"

L "A8: validacion de datos (GLPI 10 congelado vs GLPI 12)"
docker compose exec -T db sh -c "$MYQ -e \"$COUNTS\"" > /tmp/cnt_new.tsv
echo "      concepto           GLPI10     GLPI12"; join -t "$(printf '\t')" <(sort /tmp/cnt_prod.tsv) <(sort /tmp/cnt_new.tsv) | awk -F'\t' '{printf "      %-18s %8s %8s %s\n",$1,$2,$3,($2==$3?"":"<-- DISTINTO")}'
DIFF=$(join -t "$(printf '\t')" <(sort /tmp/cnt_prod.tsv) <(sort /tmp/cnt_new.tsv) | awk -F'\t' '$2!=$3' | wc -l)
echo "      version: $(docker compose exec -T db sh -c "$MYQ -e \"select value from glpi_configs where context='core' and name='version'\"")"
echo "      tareas activas: $(docker compose exec -T db sh -c "$MYQ -e \"select group_concat(name) from glpi_crontasks where state=1\"")"
rm -f /tmp/cnt_prod.tsv /tmp/cnt_new.tsv /tmp/dump.err
[ "$DIFF" = "0" ] || abort "recuentos distintos"
L "FASE A COMPLETA en $(( $(date +%s) - T0 )) s. LISTO PARA CAMBIAR EL PUERTO EN NGINX PROXY MANAGER (80 -> 8080)."
