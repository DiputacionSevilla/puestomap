# Pendiente tras montar el staging de GLPI 12 (2026-11-10)

Estado: GLPI 12.0.1 + MySQL 8.0 en Docker en `glpi-ocs` (`/opt/glpi12-migracion`, solo `127.0.0.1:18080`), con una
copia de los datos del GLPI 10.0.28 ya actualizada. GLPI 10 de producción intacto. No se ha borrado nada.
Acceso: `ssh -L 18080:127.0.0.1:18080 fjcarrion@10.158.1.220` y abrir `http://localhost:18080`.

Reglas: no parar ni modificar el GLPI 10, DNS ni proxy sin autorización; no borrar equipos ni vaciar la papelera sin
aprobar el plan; no guardar contraseñas; si se vuelve a restaurar la BD de staging, repetir la desactivación de
notificaciones, recolector de correo y tareas `mailgate`/`queuednotification` (ver más abajo).

## 1. Validación funcional (Fase E, humano + agente)
- [ ] Login de administrador en el staging; versión 12.0.1.
- [ ] Abrir ≥10 tickets de distintas épocas y estados; comprobar seguimientos, tareas, soluciones, acentos.
- [ ] Descargar adjuntos (documentos: 244; ficheros copiados en `data/glpi/files`).
- [ ] Perfiles y permisos (8 perfiles), 192 usuarios, 1 entidad, LDAP (probar sin provocar sincronización masiva).
- [ ] Impresoras 18, red 32, monitores 118, contratos 7, proveedores 5, lugares 34.
- [ ] Revisar logs del contenedor (`docker compose logs glpi`) y `/var/opt/.../logs` en `data/glpi/logs`.
- [ ] Rellenar `comparacion_datos.csv` (recuentos origen vs staging: ya coinciden en tickets, seguimientos, PCs,
      documentos, usuarios, monitores, lugares y agentes).

## 2. Integración PuestoMap contra GLPI 12
- [x] (2026-11-10) Staging: usuario `puestomap_ro` (perfil Read-Only, id 328), token en `/opt/glpi12-migracion/secrets/puestomap_ro.token`
      (600, root; GLPI 12 guarda `api_token` CIFRADO: generarlo con `User::getUniqueToken` + `GLPIKey`, no insertarlo en claro).
      API OK sin App-Token (cliente 2); PUT denegado. Sync en sombra contra el staging: 97 altas / 54 actualizaciones /
      2 conflictos (AYUPICMST, AYUHAC14), 34 lugares, 133 sin lugar = igual que contra GLPI 10; 2 errores parciales por revisar.
- [x] Los «2 errores parciales» del sync NO son fallos de la API: son los 2 conflictos de nombre (el código suma `errors` por cada
      conflicto). Son 2 pares de máquinas DISTINTAS con el mismo nombre (series y UUID diferentes):
      AYUHAC14 = GLPI 44 (serie S4PS3782, agente 2026-09-07) y 72 (S4PR3380, sin agente, mod. 2026-03);
      AYUPICmst = GLPI 57 (serie 1002594, sin agente, mod. 2023-10) y 70 (serie 1002589, agente 2026-09-02).
      En PuestoMap AYUPICMST existe sin `glpiId` (legado de OCS); AYUHAC14 no existe. Pendiente: confirmar con la etiqueta física
      cuál es el equipo vigente y pasar el otro a «Inventario anterior» (solo en el staging) antes del corte.
- [ ] (histórico) Crear en el staging un token de API de solo lectura y probar `GLPI_URL=http://…/` con el sync en modo sombra
      (sesión, `Computer`, `Computer/{id}/Item_OperatingSystem`, `Computer/{id}/Computer_Item`, `Location`, `User`,
      `State`, `Manufacturer`, `ComputerModel`, PUT de ubicación si `GLPI_WRITEBACK_LOCATION`).
      Ya comprobado: `apirest.php/initSession` responde igual que en 10.
- [ ] Comparar el informe de sombra con el de producción (97 altas / 54 actualizaciones / 2 conflictos AYUPICMST, AYUHAC14).
- [ ] Añadir al sync un filtro por estado o última actualización para no importar «Inventario anterior» (tras la limpieza).

## 3. Inventario de agentes (bloqueante antes del corte)
- [x] (2026-11-10) Staging con `auth_required=none`; agente 1.21 de AYUOAC006 enviado OK (sin duplicar equipo).
- [ ] Decidir el método para producción (recomendado: `none` + restringir `/front/inventory.php` por IP en el proxy).
- [ ] (histórico) GLPI 12 avisa: *«No authentication method is configured for inventory: agents will be rejected»*. Elegir método
      (OAuth client_credentials con alcance `inventory`, o el modo anónimo si procede y la red es de confianza) en
      Configuración → Inventario.
- [ ] Probar con un agente piloto (GLPI Agent 1.21) que soporta el método elegido; si no, actualizar el agente.
- [x] Probado con proxy nginx: `apirest.php` e `inventory.php` funcionan bajo `/glpi/`; la WEB NO (enlaces absolutos desde `/`).
      Decisión pendiente: web en la raíz del dominio + `/glpi/` solo compatibilidad (ver `proxy-ejemplo.conf`) y avisar a los usuarios.
- [x] Servicio `proxy` (nginx) añadido al compose del staging: `127.0.0.1:18081`, config en `proxy/default.conf`
      (web en `/`, `/glpi/` solo `inventory.php` y `apirest.php`, resto de `/glpi/...` redirige a `/...` con https).
      Probado con cabeceras simuladas de Nginx Proxy Manager. En el corte, NPM solo cambia IP y puerto de reenvío.
- [ ] Ajustar `geo $inventario_permitido` (subredes de agentes) antes de producir; probar en NPM con TLS real.
- [ ] (histórico) Definir la URL: hoy los agentes envían a `https://soporte.mairenadelalcor.net/glpi/front/inventory.php`.
      La imagen sirve en la raíz (GLPI 11/12 usan `public/`): o el proxy mapea `/glpi/` → contenedor, o hay que
      cambiar `SERVER` de los agentes (GPO / script de despliegue) y `GLPI_URL` de PuestoMap.
- [ ] No desplegar agentes al staging mientras GLPI 10 sea producción, salvo pilotos expresos.

## 3b. Migración de agentes antes del corte (2026-11-10)
- Hallazgo: GLPI 10 conserva las tablas del plugin FusionInventory y 42 PCs reportaban SOLO por ese agente; GLPI 12 las migra a
  `glpi_agents` (146 filas en staging vs 17 en prod) pero esos agentes dejarían de reportar tras el corte. Hay que migrarlos al GLPI Agent 1.21.
- Hecho hoy con `Deploy-GlpiAgentRemote.ps1`: ~37 PCs más con GLPI Agent (prod: 48 agentes, todos con contacto hoy). Pendientes: 24 con solo
  FusionInventory (11 vistos encendidos hoy, 13 apagados/no vistos). Fallos conocidos: `sc create` denegado (AYUGMU07, AYUGMU08, AYUAPL05,
  MA0134, AYUSSO04), tiempo agotado (ayu1002, AYUOBR019, AYUSSO0002, AYUGMU02, AYUAPL04, ayurrhh0009), dominio no disponible
  (AYUORI08, ayun1004, AYUCUL04, AYUOAC69, AYUSSO051, AYUSEC036), servicio de logon (AYUHAC09, AYUHAC12), credenciales (AYUdeliPract,
  MA0214), tipo de logon no permitido (POL-TRAMITE), AYURRH01 (VM) y AYUBIB01 por confirmar. Siguiente: GPO/instalación local.
- Criterio de limpieza: usar contacto de agente (GLPI y FusionInventory), NO `date_mod`. Plan por equipo: `docs/plan_depuracion_equipos.csv`.

## 3c. Correo de GLPI (2026-11-10)
- Diagnóstico GLPI 10: 696 notificaciones sin enviar desde 2026-07-21, ninguna con intentos. La tarea `queuednotification` está en modo CLI
  (mode 2) y NO hay cron del sistema que lance `cron.php`: última ejecución 2026-07-20. SMTP: `correo.mairenadelalcor.es:587` con STARTTLS
  (en GLPI 10 `smtp_mode=3` = SMTP+TLS, correcto; 465 también responde). El log de errores SMTP solo trae fallos de 2023.
- Staging GLPI 12: `smtp_mode` migrado a 1 (SMTP con STARTTLS automático). Cola antigua apartada (`is_deleted=1`, 682, reversible),
  notificaciones activadas y correo de prueba (`NotificationMailing::testNotification`) enviado a `admin_email`: GLPI informa éxito.
  El cron del contenedor sigue desactivado (`GLPI_CRONTAB_ENABLED=0`, tareas en estado 0).
- Prueba de extremo a extremo (2026-11-10, staging): el correo de prueba llegó (el proveedor tarda unos minutos). Incidencia de ensayo #1803 por
  API con `prueba_tecnico` (perfil Technician, sin correo; contraseña en `/opt/glpi12-migracion/secrets/prueba_tecnico.pass`, 600): 1 aviso en cola,
  solo a `admin_email`, y el cron del contenedor (`GLPI_CRONTAB_ENABLED=1`, solo `queuednotification` activa) lo envió solo en <1 min, sin errores.
  Staging devuelto a modo seguro: cron del contenedor apagado, tareas con su estado original, notificaciones desactivadas.
  Para repetir: `GLPI_CRONTAB_ENABLED=1 docker compose up -d --no-deps glpi` tras activar `use_notifications` y dejar activa solo esa tarea.
  Nota: en el contenedor root no puede borrar ficheros de otros usuarios en /tmp (rm da «Operation not permitted»): usar `|| true`.
- Remitente (2026-11-10): con `informatica@` como remitente pero autenticando con `fjcarrion@` el proveedor ACEPTA y no ENTREGA (solo llegó la
  prueba enviada como `fjcarrion@`). Solución elegida: usar el buzón propio `informatica@mairenadelalcor.es` como usuario SMTP (su clave está en
  `.env` como `CORREO_PW`/`CORREO_US`). Staging ya configurado con él (`scripts/set-smtp.php`, clave cifrada); prueba enviada (cola `3EEEE80051`).
  EN EL CORTE hay que REPETIR este paso: la copia final de GLPI 10 trae otra vez el usuario/clave antiguos (de `fjcarrion@`).
- Diagnóstico de entrega (2026-11-10): `informatica@`→`informatica@` llega rápido; `informatica@`→`fjcarrion@` NO llega (el proveedor acepta en cola);
  `fjcarrion@`→`fjcarrion@` llega. Sospecha: filtro/regla/cuarentena en el buzón `fjcarrion@` (SPF del dominio `-all`, DMARC `quarantine`,
  MX en SpamExperts). Staging: `admin_email` = `informatica@`; incidencia de ensayo #1804 → 1 aviso, solo a `informatica@`, enviado por el cron
  del contenedor. Restauración del cron por id: `secrets/crontasks_por_id.tsv`. Pendiente: probar un tercer buzón interno y revisar la
  cuarentena de SpamExperts. EN EL CORTE: fijar también `admin_email=informatica@` (la copia final trae `fjcarrion@`).
- App de incidencias móvil (`../glpi-incidencias-movil`) vs staging GLPI 12 (2026-11-10): `probe:glpi` OK por `/glpi/apirest.php` y flujo de escritura
  replicado con `prueba_tecnico` (crear asignada, leer, editar, seguimiento público, cierre a estado 6 con `status-closed`): 11/11 pasos OK
  (incidencia #1805). Sin probar: la app en sí (BFF/Redis) ni a través de https/proxy real; las notificaciones estaban apagadas.
- Para el corte: en GLPI 12 activar `GLPI_CRONTAB_ENABLED=1` y las tareas `queuednotification`/`mailgate`; apartar la cola antigua ANTES
  de activar el cron (si no se enviarían ~700 avisos de julio a noviembre); probar un ticket de ensayo con destinatarios controlados.

## 4. Limpieza del inventario (solo en el staging, con plan aprobado)
Datos de la Fase A: 153 PCs activos; **138 sin actualizar >180 días**; `glpi_items_tickets` vacía (ningún ticket enlaza PCs).
- [ ] Exportar `plan_depuracion_equipos.csv` (id, nombre, serie, UUID, estado, última actualización, vínculos).
- [ ] Comprobar otros vínculos antes de papelera: software instalado, documentos, contratos, redes, monitores.
- [ ] Estado `Inventario anterior` o papelera por lotes (sin vaciar); lista reversible de cambios.
- [ ] Reglas de importación/enlace por serie/UUID para no duplicar (AYUPICMST y AYUHAC14).
- [ ] Autorización explícita del usuario antes del borrado definitivo.

## 5. Preparar la VM definitiva (Fase G)
- [ ] VM Ubuntu 24.04, 2–4 vCPU, 4–8 GB RAM, disco ≥ 40 GB, IP fija, DNS, HTTPS, NTP, backup externo.
- [ ] Transferir `compose.yaml`, `.env` (600), `data/glpi/` y un volcado lógico (no copiar `/var/lib/mysql` en caliente).
- [ ] Restaurar en volumen nuevo, comprobar `config_db.php` → `db`, NO relanzar `database:update` si ya es 12.
- [ ] Fijar digest de las imágenes (`glpi/glpi@sha256:02b4e814…7b06` visto en el staging) y no usar `latest`.
- [ ] Backups diarios (dump + `data/glpi`) con copia externa cifrada y prueba de restauración.

## 6. Corte definitivo (requiere ventana y autorización)
- [ ] Congelar GLPI 10 (mantenimiento, correo entrante y tareas parados), nueva copia final con hashes.
- [ ] Repetir actualización + limpieza ensayada desde esa copia; trasladar a la VM; verificar ≥10 tickets y adjuntos.
- [ ] Proxy/DNS hacia la VM; activar cron y notificaciones solo allí; revisar `url_base` y SMTP.
- [ ] Mantener GLPI 10 conservado y no editable hasta acabar la estabilización.
- [ ] Reapuntar PuestoMap (`GLPI_URL`, token de solo lectura, `GLPI_SHADOW=false` tras revisar `wouldCreate`; `pg_dump` antes).

## 6b. Ensayo del corte (2026-11-10, 13:25-13:30) — `scripts/ensayo-corte.sh`
Entorno separado `/opt/glpi12-ensayo` (puertos 18090/18091, BD propia), con volcado fresco del GLPI 10 vivo (solo lectura: `mysqldump --single-transaction`).
Tiempos: volcado+ficheros ~25 s, parar staging 1 15 s, restaurar 105 s, `database:update` 79 s, resto <10 s; TOTAL 246 s (4 min).
Validación: tickets 1804, seguimientos 414, docs 244, usuarios 192, equipos 168, monitores 128, lugares 34: IGUALES al origen; esquema íntegro; web 200; API `/glpi/` 200;
versión 12.0.1. Hallazgos: (1) `auth_required` llega vacío y el inventario se rechaza hasta fijarlo en `none`; (2) 696 notificaciones atrasadas a apartar
(`is_deleted=1`) antes de activar el cron; (3) config de correo (usuario/clave cifrados de informatica@ + admin_email) se copia como sentencias SQL cifradas;
(4) `tar` avisa de ficheros de caché con fecha futura: inofensivo; (5) el origen ya tiene 2 incidencias más que la copia de las 01:06 → copia final en la ventana.
Riesgo: tras el ensayo el disco del servidor pasó a 94 % (1,3 GB libres). Borrar el volumen del ensayo (`docker compose down -v` en /opt/glpi12-ensayo) requiere confirmación.

## 6c. CORTE REALIZADO (2026-11-10, ventana 13:36-13:45)
Fase A (`scripts/corte-fase-A.sh`, 253 s): GLPI 10 en mantenimiento (+ recolector y cola parados), copia final con SHA256 (`corte_*` en
`/var/backups/glpi-migracion`), restauración en la BD del staging (recreada), `database:update` a 12.0.1, config (url_base sin /glpi, `auth_required=none`,
correo de informatica@, 696 avisos atrasados BORRADOS a petición del usuario), nginx en `10.158.1.220:8080`. Recuentos idénticos. LECCIÓN: la copia
heredó `maintenance_mode=1` de GLPI 10 y hubo que ponerlo a 0 en GLPI 12 (ya corregido en el script).
Nginx Proxy Manager: `Forward Port` 80 → 8080 (hecho por el usuario). Comprobado en `https://soporte.mairenadelalcor.net/`: login GLPI 12, `/glpi/` → `/`,
API y inventario OK. Cron del contenedor ON con solo `queuednotification`, `queuednotificationclean`, `mailgate` (resto de tareas OFF a propósito:
`PurgeLogs`, `cleanorphans`, `pendingreason_autobump_autosolve`, etc. quedan por revisar). PuestoMap: token OK por la URL pública y sync en sombra
OK (99 altas, 67 act., 1 conflicto AYUPICMST). El 502 del worker a las 13:30 fue ANTES del corte (ensayo, poca RAM).
GLPI 10 sigue en mantenimiento como marcha atrás: `scripts/rollback-corte.sh` + puerto 80 en NPM.
PENDIENTE: URL de la app de incidencias (`http://10.158.1.220:8080/glpi`), agentes FusionInventory (24 PCs sin agente GLPI), disco 88 %/RAM justa, cron de las
demás tareas, correo real a técnicos, estabilización y decisión sobre retirar GLPI 10.

## 7. Seguridad y operación
- [ ] Cambiar las contraseñas de `fjcarrion` y del usuario `glpi` de MySQL (ambas se vieron en el chat); retirar la clave
      pública de Claude de `authorized_keys` cuando acabe el trabajo.
- [ ] Copia externa de `/var/backups/glpi-migracion` (mismo disco hoy, 80 % usado).
- [ ] Parar el staging cuando no se use: `cd /opt/glpi12-migracion && sudo docker compose stop` (nunca `down -v`).
- [ ] ACL de perfiles (derechos nuevos en GLPI 12), HTTPS, retirar `ocsinventory-db` solo si el usuario lo decide.

## Comandos útiles (en el servidor, con sudo)
```
cd /opt/glpi12-migracion
docker compose ps ; docker compose logs --tail=100 glpi
docker compose stop            # parar el staging (conserva datos)
docker compose up -d           # arrancarlo (revisar antes las notificaciones desactivadas)
```
Para desactivar correo en una base restaurada de nuevo (dentro del contenedor `db`, en la BD `glpi`):
`update glpi_configs set value=0 where context='core' and name in ('use_notifications','notifications_mailing');`
`update glpi_mailcollectors set is_active=0;`
`update glpi_crontasks set state=0 where name in ('mailgate','queuednotification','queuednotificationclean','mailgateerror');`

## 6d. CIERRE DE LA MIGRACIÓN (2026-11-10)
El usuario confirmó que llegan los correos y declaró finalizada la migración: GLPI 12 queda en producción. Verificado: tickets creados desde la app
(#1805, #1806) → avisos enviados por cron al primer intento y recibidos. GLPI 10 sigue en mantenimiento (marcha atrás, `scripts/rollback-corte.sh`).
Pendiente post-migración: ver sección 6c (agentes FusionInventory, disco/RAM/VM, copia externa, tareas cron restantes, retirada de GLPI 10).

## 6e. PuestoMap en sincronización real (2026-11-10, 14:00Z)
`GLPI_SHADOW=false` en el `.env` de PuestoMap prod y worker reconstruido (backup previo de la BD). Primera sync: 99 altas + 67 vinculados
(243 equipos, 166 con glpiId). `GLPI_WRITEBACK_LOCATION=false` (PuestoMap no escribe en GLPI). Pendiente: duplicado AYUPICMST (GLPI 57/70) y
~149 equipos sin ubicación en GLPI (salen sin posición en el plano).
