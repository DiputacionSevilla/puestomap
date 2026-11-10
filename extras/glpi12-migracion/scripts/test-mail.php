<?php
// Envía UN correo de prueba (a admin_email) con la configuración actual y muestra solo éxito e id de cola. No imprime la conversación SMTP
// (contiene usuario/clave en base64).
require '/var/www/glpi/vendor/autoload.php';
$k = new Glpi\Kernel\Kernel('production'); $k->boot();
global $CFG_GLPI;
$r = NotificationMailing::testNotification();
$q = ''; if (preg_match('/queued as ([A-Za-z0-9]+)/', (string)($r['debug'] ?? ''), $m)) $q = $m[1];
$err = preg_replace('/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/', '<email>', (string)($r['error'] ?? ''));
echo "success=", var_export((bool)($r['success'] ?? false), true), " cola_id=", $q, " error=", mb_substr($err, 0, 160), "\n";
