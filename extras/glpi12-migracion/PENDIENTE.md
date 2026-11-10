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
- [ ] Crear en el staging un token de API de solo lectura y probar `GLPI_URL=http://…/` con el sync en modo sombra
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
