<?php
// Fija usuario y clave SMTP en GLPI 12 leyendo 2 lineas por STDIN (usuario, clave). La clave se cifra con glpicrypt.key.
// Uso (en el servidor): docker exec -i -u www-data <contenedor glpi> php /tmp/set-smtp.php < /ruta/fichero_600   (borrar el fichero después)
// Después probar con scripts/test-mail.php. NO se escribe nada por línea de comandos ni se imprime la clave.
require '/var/www/glpi/vendor/autoload.php';
$k = new Glpi\Kernel\Kernel('production'); $k->boot();
global $DB;
$us = trim((string)fgets(STDIN)); $pw = rtrim((string)fgets(STDIN), "\r\n");
if ($us === '' || $pw === '') { echo "credenciales vacias\n"; exit(1); }
$key = new GLPIKey();
$a = $DB->update('glpi_configs', ['value' => $us], ['context' => 'core', 'name' => 'smtp_username']);
$b = $DB->update('glpi_configs', ['value' => $key->encrypt($pw)], ['context' => 'core', 'name' => 'smtp_passwd']);
echo "usuario=", var_export((bool)$a, true), " clave_cifrada=", var_export((bool)$b, true), "\n";
