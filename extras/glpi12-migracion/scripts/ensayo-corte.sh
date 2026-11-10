set -o pipefail
L(){ echo "[$(date +%H:%M:%S)] $*"; }
LAP=$(date +%s); T0=$LAP
lap(){ n=$(date +%s); echo "      >> $1: $((n-LAP)) s"; LAP=$n; }
SRC=/opt/glpi12-migracion; DST=/opt/glpi12-ensayo; BK=/var/backups/glpi-migracion; TS=$(date +%Y%m%d-%H%M)
MYQ='mysql -uroot -p"$MYSQL_ROOT_PASSWORD" glpi -N -B 2>/dev/null'
COUNTS="select 'tickets',count(*) from glpi_tickets union all select 'seguimientos',count(*) from glpi_itilfollowups union all select 'documentos',count(*) from glpi_documents union all select 'usuarios',count(*) from glpi_users union all select 'equipos_activos',count(*) from glpi_computers where is_deleted=0 union all select 'monitores',count(*) from glpi_monitors union all select 'lugares',count(*) from glpi_locations"
L "PASO 0: disco"; AV=$(df --output=avail -m / | tail -1 | tr -d ' '); echo "      libre: ${AV} MB"; [ "$AV" -gt 1500 ] || { L "DISCO INSUFICIENTE: abortado"; exit 1; }
L "PASO 1: recuentos vivos de GLPI 10 y volcado fresco (solo lectura)"
mysql glpi -N -B -e "$COUNTS" 2>/dev/null > /tmp/cnt_prod.tsv
mysqldump --single-transaction --routines --triggers --events --no-tablespaces glpi 2>/tmp/dump.err | gzip > $BK/ensayo_origen_$TS.sql.gz || { L "VOLCADO FALLO"; head -3 /tmp/dump.err; exit 1; }
( cd $BK && sha256sum ensayo_origen_$TS.sql.gz > SHA256SUMS_ensayo_$TS ); ls -la $BK/ensayo_origen_$TS.sql.gz | awk '{print "      volcado: "$5" bytes"}'; gunzip -t $BK/ensayo_origen_$TS.sql.gz && echo "      integridad gzip OK"
tar -C /var/lib/glpi -czf $BK/ensayo_varlib_$TS.tgz . ; ls -la $BK/ensayo_varlib_$TS.tgz | awk '{print "      ficheros: "$5" bytes"}'
lap "volcado y copia de ficheros"
L "PASO 2: guardar config de correo del staging 1 (valores cifrados) y pararlo"
cd $SRC
docker compose exec -T db sh -c "$MYQ -e \"select concat('update glpi_configs set value=',quote(value),' where context=\\\"core\\\" and name=',quote(name),';') from glpi_configs where context='core' and name in ('smtp_username','smtp_passwd','admin_email')\"" > /tmp/cfgmail.sql
chmod 600 /tmp/cfgmail.sql; echo "      sentencias de correo guardadas: $(wc -l < /tmp/cfgmail.sql)"
docker compose stop 2>&1 | grep -vi swap | tail -3
lap "parar staging 1"
L "PASO 3: preparar entorno de ensayo $DST"
mkdir -p $DST/data/glpi/config $DST/data/glpi/files $DST/data/glpi/logs $DST/data/glpi/marketplace
sed 's/^name: .*/name: glpi12_ensayo/' $SRC/compose.yaml > $DST/compose.yaml
cp -r $SRC/proxy $DST/proxy
cp -p $SRC/.env $DST/.env; chmod 600 $DST/.env
sed -i -E 's/^GLPI_HOST_PORT=.*/GLPI_HOST_PORT=18090/' $DST/.env; grep -q '^PROXY_HOST_PORT=' $DST/.env || echo 'PROXY_HOST_PORT=18091' >> $DST/.env
cp -p $SRC/data/glpi/config/* $DST/data/glpi/config/
tar -C $DST/data/glpi/files -xzf $BK/ensayo_varlib_$TS.tgz
chown -R 33:33 $DST/data/glpi
lap "preparar ficheros"
L "PASO 4: base de datos nueva y restauracion"
cd $DST && docker compose up -d db 2>&1 | grep -vi swap | tail -2
n=0; until [ "$(docker inspect -f '{{.State.Health.Status}}' glpi12_ensayo-db-1 2>/dev/null)" = "healthy" ] || [ $n -ge 90 ]; do sleep 2; n=$((n+1)); done
echo "      db: $(docker inspect -f '{{.State.Health.Status}}' glpi12_ensayo-db-1)"
lap "arrancar MySQL"
gunzip -c $BK/ensayo_origen_$TS.sql.gz | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" glpi 2>/dev/null' && echo "      restauracion OK"
lap "restaurar volcado"
L "PASO 5: arrancar GLPI 12 y actualizar el esquema (10.0.28 -> 12)"
docker compose up -d glpi 2>&1 | grep -vi swap | tail -2
n=0; until docker compose exec -T glpi sh -c 'test -f /var/www/glpi/bin/console' 2>/dev/null || [ $n -ge 30 ]; do sleep 2; n=$((n+1)); done
docker compose exec -T -u www-data glpi php bin/console database:update --no-interaction 2>&1 | tail -12
lap "database:update"
docker compose exec -T -u www-data glpi php bin/console database:check_schema_integrity --no-interaction 2>&1 | tail -3
docker compose exec -T -u www-data glpi php bin/console system:check_requirements --no-interaction 2>&1 | tail -3
lap "comprobaciones de esquema y requisitos"
L "PASO 6: configuracion del corte (correo apagado en el ensayo)"
cat > /tmp/post.sql <<'SQL'
update glpi_configs set value='https://soporte.mairenadelalcor.net' where context='core' and name='url_base';
update glpi_configs set value=0 where context='core' and name in ('use_notifications','notifications_mailing');
update glpi_mailcollectors set is_active=0;
update glpi_crontasks set state=0 where name in ('mailgate','queuednotification','queuednotificationclean','mailgateerror');
select 'notificaciones_sin_enviar_apartadas', count(*) from glpi_queuednotifications where sent_time is null;
update glpi_queuednotifications set is_deleted=1 where sent_time is null;
select 'auth_required_antes', value from glpi_configs where context='inventory' and name='auth_required';
SQL
cat /tmp/cfgmail.sql >> /tmp/post.sql
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" glpi -N 2>/dev/null' < /tmp/post.sql
rm -f /tmp/post.sql /tmp/cfgmail.sql
docker compose up -d proxy 2>&1 | grep -vi swap | tail -1
lap "configuracion post-restauracion"
L "PASO 7: inventario de agentes antes y despues de fijar auth_required"
PRO='{"action":"contact","deviceid":"ensayo-prolog-0001","query":"PROLOG"}'
echo "      sin metodo de autenticacion: $(curl -s -m 20 -X POST -H 'Content-Type: application/json' -d "$PRO" http://127.0.0.1:18091/glpi/front/inventory.php | cut -c1-160)"
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" glpi -e "update glpi_configs set value=\"none\" where context=\"inventory\" and name=\"auth_required\"" 2>/dev/null'
echo "      con auth_required=none:      $(curl -s -m 20 -X POST -H 'Content-Type: application/json' -d "$PRO" http://127.0.0.1:18091/glpi/front/inventory.php | cut -c1-160)"
lap "prueba de inventario"
L "PASO 8: validacion de datos (origen vivo vs ensayo)"
docker compose exec -T db sh -c "$MYQ -e \"$COUNTS\"" > /tmp/cnt_ens.tsv
echo "      concepto           GLPI10_vivo  ensayo"; join -t "$(printf '\t')" <(sort /tmp/cnt_prod.tsv) <(sort /tmp/cnt_ens.tsv) | awk -F'\t' '{printf "      %-18s %8s %8s %s\n",$1,$2,$3,($2==$3?"":"<-- distinto")}'
echo "      web (login) por nginx: $(curl -s -m 20 -o /dev/null -w '%{http_code}' -H 'Host: soporte.mairenadelalcor.net' -H 'X-Forwarded-Proto: https' http://127.0.0.1:18091/)"
echo "      apirest por /glpi/:   $(curl -s -m 20 -o /dev/null -w '%{http_code}' http://127.0.0.1:18091/glpi/apirest.php/)"
echo "      version GLPI en BD:   $(docker compose exec -T db sh -c "$MYQ -e \"select value from glpi_configs where context='core' and name='version'\"")"
echo "      ultimas lineas del log php:"; tail -n 3 data/glpi/logs/php-errors.log 2>/dev/null | cut -c1-160
lap "validacion"
L "FIN. Tiempo total del ensayo: $(( $(date +%s) - T0 )) s"
echo "$TS" > /tmp/ensayo_ts
