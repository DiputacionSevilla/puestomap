#!/bin/bash
# Marcha atras del corte a GLPI 12: devuelve GLPI 10 a servicio. NO borra nada de GLPI 12.
# Despues hay que volver a poner el puerto de Nginx Proxy Manager en 80 y la URL de la app de incidencias a la anterior.
BK=/var/backups/glpi-migracion
F=$(ls -t $BK/rollback_glpi10_*.tsv 2>/dev/null | head -1)
[ -n "$F" ] || { echo "no hay fichero de estado previo de GLPI 10"; exit 1; }
echo "usando $F"
SQL=""
while IFS=$'\t' read -r kind name val; do
  [ "$kind" = "task" ] && SQL="$SQL update glpi_crontasks set state=$val where name='$name';"
done < "$F"
mysql glpi -e "update glpi_configs set value='0' where context='core' and name='maintenance_mode'; $SQL" 2>/dev/null && echo "GLPI 10: mantenimiento DESACTIVADO y tareas de correo restauradas"
echo "respuesta de GLPI 10: $(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1/glpi/front/ticket.php)"
cd /opt/glpi12-migracion 2>/dev/null && GLPI_CRONTAB_ENABLED=0 docker compose up -d --no-deps glpi 2>&1 | grep -vi swap | tail -1
echo "GLPI 12: cron apagado. Falta: Nginx Proxy Manager -> puerto 80 y .env de la app de incidencias a su URL anterior."
