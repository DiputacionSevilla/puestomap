> **LEER ANTES: `CORRECCIONES.md` (prevalece sobre este documento; motor MySQL 8.0, rutas reales, migraciones previas y límites de memoria).**

# Procedimiento operativo para agente IA: GLPI 10.0.28 → GLPI 12.0.1 en Docker, limpieza del inventario y traslado a nueva VM

**Fecha del diseño:** 10/11/2026  
**Ámbito:** servidor Ubuntu existente (20.04/22.04 por confirmar), instalación tradicional de GLPI 10.0.28 en producción; Docker y Compose disponibles. Posterior traslado a una VM nueva.  
**Objetivo de datos:** conservar íntegros tickets, seguimientos, tareas, soluciones, adjuntos, usuarios, perfiles, entidades, ubicaciones, contratos, proveedores, impresoras, equipos de red, documentos y el resto de activos. Renovar el inventario *operativo* de ordenadores con GLPI Agent. OCS ya no existe.  
**Resultado:** GLPI 12.0.1 + MariaDB 10.11 en Docker; primero en paralelo y aislado en el host actual; después en VM independiente.  
**Estado:** plan de ejecución, pendiente de descubrimiento real y aprobación de puntos críticos.

> **Orden al agente**: seguir las fases y puntos de control. Ejecutar únicamente tareas de lectura y construcción del entorno nuevo sin aprobación adicional. Antes de detener producción, cambiar DNS, modificar el GLPI 10, borrar registros/volúmenes, migrar definitivamente o desactivar servicios existentes, presentar hallazgos, impacto y solicitud de autorización. Nunca interpretar un error de ejecución como permiso para improvisar comandos destructivos.

## 0. Contrato de trabajo y normas de seguridad

1. **No modificar el GLPI 10 ni su MariaDB/Apache/cron al preparar el entorno de pruebas.** No cambiar puertos 80/443 ni configuración del proxy existente.
2. No tocar recursos Docker ajenos. Usar solo el proyecto `glpi12_migracion` en `/opt/glpi12-migracion`. Evitar `docker system prune`, `docker volume prune`, `docker compose down -v`, `docker rm` indiscriminado y `DROP DATABASE` sobre el servidor original.
3. No exponer datos de GLPI, credenciales, claves, copias, `.env` ni SQL en tickets públicos, repositorios o respuestas del agente. Redactar logs; permisos 600/700 para datos sensibles.
4. **El primer despliegue escucha únicamente en `127.0.0.1:18080`.** Acceder mediante túnel SSH, no publicar el puerto ni activar envío de correos, LDAP programado, inventario o notificaciones en las pruebas.
5. Desactivar explícitamente autoinstalación, autoupdate y cron del contenedor; ejecutar a mano `database:update` únicamente tras restaurar la base de datos y guardar copia.
6. **No borrar automáticamente equipos históricos.** Muchos tickets pueden enlazarlos. Primero inventariar dependencias, archivar/categorizar y validar importación nueva. El borrado definitivo es una decisión adicional con autorización explícita y copia verificable.
7. No copiar indiscriminadamente plugins de GLPI 10 al directorio de código de GLPI 12. Registrar versiones y vías de actualización. Consultar compatibilidad antes de activarlos.
8. Capturar diagnóstico y evidencias con salidas sin secretos; cada fase termina con criterio `APTO/NO APTO`. Ante un `NO APTO`, detener la fase y conservar el origen.
9. La restauración sobre un nuevo servidor y la promoción a producción deben poder repetirse **desde copias del origen congeladas**, no basarse exclusivamente en una base de datos de pruebas que haya quedado obsoleta.
10. El Docker del servidor antiguo usa el mismo kernel y almacenamiento que GLPI 10: es un buen *staging*, pero **no proporciona independencia ante avería del host**. Hacer al menos una copia externa antes de iniciar.

## 1. Fase A — Descubrimiento (solo lectura)

### A.1 Inventario de plataforma y capacidad

```bash
set -o pipefail
lsb_release -a
uname -a
php -v || true
mysql --version || mariadb --version || true
apache2 -v || nginx -v || true
docker version
docker compose version
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
ss -lntp
free -h
df -h
df -i
lsblk -f
sudo find /var/www /etc/glpi /var/lib/glpi -type f -name config_db.php 2>/dev/null || true
sudo find /var/www /etc/glpi /var/lib/glpi -type f \( -name glpicrypt.key -o -name glpi.key \) 2>/dev/null || true
```

**Anotar sin mostrar secretos:** distribución y kernel; `GLPI_ROOT`, ubicación real de `config`, `files`, `marketplace`, `plugins`, `inc/downstream.php`, claves; DBMS/versión y nombre de BD; tipo y tamaño de base de datos; espacio disponible; versión Docker Compose; red/proxy y certificado; tareas cron; correo y LDAP; configuración de agentes, API, SSO y autenticación; zona horaria; uso CPU/RAM actual. Verificar si existe GLPI 11 en otro host: no asumir que forma parte del proyecto. Si el SQL actual está en otro servidor, no conectar por error a esa base desde Docker.

**Capacidad:** estimar al menos espacio adicional para dump, archivos, nueva BD, copias y transferencia. Si el host carece de RAM/disco suficientes, usar VM nueva desde el comienzo en lugar del despliegue paralelo.

### A.2 Inventario funcional y de plugins

- Listar plugins instalados y activos en la interfaz y/o tablas de plugins, incluidas rutas de `plugins` y `marketplace`.
- Identificar `formcreator` y `genericobject` (también otros plugins con datos propios). **Si existen, no dar por segura la migración directa**: estos dos tienen migraciones especiales al núcleo en GLPI 11+, mediante `migration:formcreator_plugin_to_core` y `migration:genericobject_plugin_to_core`. Elaborar rama específica y probar con versión de plugin compatible, eventualmente usando paso intermedio por GLPI 11 antes de GLPI 12.
- Documentar otros plugins no compatibles, integraciones REST, scripts externos, correo entrante, LDAP/AD y tareas automáticas.
- Revisar `glpi_configs`, reglas de importación/enlace y entidades para evitar agentes duplicados.
- Inventariar adjuntos y personalizaciones; exportar la lista de ordenadores, `id`, nombre, número de serie, UUID y vínculos con tickets antes de tocarlos.

**No imprimir contenido de `config_db.php` ni claves en el informe.** Si un agente necesita leerlos localmente, enmascarar resultados y preservar la confidencialidad.

### A.3 Línea base funcional (anotar recuentos)

Registrar recuentos de tablas existentes, tras verificar su esquema: `glpi_tickets`, `glpi_itilfollowups`, `glpi_tickettasks`, `glpi_ticketsatisfactions`, `glpi_documents`, `glpi_documents_items`, `glpi_users`, `glpi_entities`, `glpi_profiles`, `glpi_computers`, `glpi_items_tickets`, `glpi_printers`, `glpi_networkequipments`, `glpi_contracts`, `glpi_suppliers`. Comprobar además ejemplos de tickets cerrados/abiertos con adjuntos y equipos enlazados. Guardar resultados en `/opt/glpi12-migracion/logs/linea_base_origen.csv` (sin datos personales innecesarios).

**Puerta A:** descripción real, inventario de plugins y espacio disponible; sin cambios sobre producción.

## 2. Fase B — Copia íntegra recuperable del GLPI 10

1. Preparar ubicación segura de backups fuera del document root, idealmente con réplica a NAS u otro sistema:

```bash
sudo install -d -m 700 /var/backups/glpi-migracion
sudo install -d -m 700 /opt/glpi12-migracion
```

2. Localizar el nombre real de la BD, las rutas y el método de autenticación **sin revelar contraseñas**. Crear un volcado lógico consistente (`mariadb-dump` o `mysqldump` según el origen). Ejemplo **SOLO si BD local y acceso por sudo/socket**:

```bash
# Sustituir BD_REAL tras descubrimiento; comprobar que el comando ha finalizado correctamente.
sudo mariadb-dump --single-transaction --quick --routines --triggers --events \
  --default-character-set=utf8mb4 BD_REAL \
  | gzip -1 > /var/backups/glpi-migracion/glpi10_origen.sql.gz
```

**Advertencia:** si el directorio de copia es `root:root 700`, la redirección anterior necesitará shell root (`sudo sh -c '...'`) o escribirse primero en un directorio privado accesible al operador y luego mover con `sudo install -m 600`. No ejecutar sin adaptar. Si el motor es MySQL, usar su cliente compatible. En BD con mucha escritura, respaldar/coordinar también adjuntos; para el corte definitivo habrá parada o modo de mantenimiento efectivo.

3. Respaldar `config`, `files`, `plugins`, `marketplace`, `inc/downstream.php`, certificados/config externa, cron personalizado, configuración del servidor web y la instalación completa de GLPI 10 (recomendado). Ejemplo adaptable:

```bash
# Ejemplo ilustrativo: comprobar GLPI_ROOT real antes.
sudo tar -czpf /var/backups/glpi-migracion/glpi10_archivos.tar.gz \
  -C /var/www glpi
sudo sha256sum /var/backups/glpi-migracion/glpi10_*.gz \
  > /var/backups/glpi-migracion/SHA256SUMS
```

4. Comprobar integridad del gzip (`gzip -t`) y del tar (`tar -tzf`), tamaño no nulo, permisos, hash y copia externa. Un backup no debe considerarse válido sin prueba de restauración en el entorno de staging.
5. Si se usa snapshot, hacerlo **adicionalmente**; nunca sustituye al volcado de BD y documentos.

**Puerta B:** restauración factible, backup externo y lista de claves/adjuntos incluidos. **No seguir si faltan `glpicrypt.key` u otros archivos esenciales.**

## 3. Fase C — Preparar Docker paralelo en el mismo servidor

### C.1 Ficheros y secretos

Copiar `compose.yaml` y `env.example` incluidos en este paquete a `/opt/glpi12-migracion`. Crear `.env` real con claves diferentes y aleatorias, por ejemplo con `openssl rand -hex 32` para cada una. No imprimirlas en el registro del agente.

```bash
cd /opt/glpi12-migracion
sudo install -d -m 750 -o root -g root data/glpi backups logs
sudo install -d -m 750 -o 33 -g 33 data/glpi/config data/glpi/files \
  data/glpi/logs data/glpi/marketplace
sudo chmod 600 .env
sudo docker compose config --quiet
sudo docker compose pull
sudo docker compose up -d db
sudo docker compose ps
```

`compose.yaml` aísla MariaDB (no expone el puerto 3306), liga la web a `127.0.0.1:18080` por defecto, usa MariaDB 10.11, GLPI oficial 12.0.1 y un directorio persistente `./data/glpi` montado en `/var/glpi`. Las imágenes llevan etiquetas fijas: registrar su digest para producción. **No usar `latest`.**

**Cuidado con propietarios:** la imagen GLPI oficial ejecuta la aplicación como `www-data` (UID normalmente 33), que debe poder escribir en `/var/glpi`. No hacer `chown -R` sobre rutas del GLPI antiguo.

### C.2 Acceso privado

Desde un puesto administrador, ejemplo de túnel:

```bash
ssh -L 18080:127.0.0.1:18080 USUARIO@SERVIDOR_GLPI_ACTUAL
```

Navegar a `http://localhost:18080` solamente desde el puesto conectado por SSH. No configurar aún un reverse proxy público ni usar el mismo FQDN de GLPI 10.

**Puerta C:** `docker compose ps` muestra DB saludable, no hay nuevos listeners públicos en 80/443/3306 y el GLPI 10 original sigue atendiendo. En esta fase el servicio GLPI 12 puede no arrancar completamente porque aún no se ha restaurado/configurado la base; es lo esperado.

## 4. Fase D — Restaurar GLPI 10 en la BD de staging

### D.1 Base de datos

Restaurar el dump del origen sobre **la BD nueva del contenedor**. El nombre de BD/usuario de la nueva composición puede ser `glpi`; la base antigua se conserva en el backup lógico.

```bash
cd /opt/glpi12-migracion
# Sustituir RUTA_DUMP por la copia REAL validada.
gzip -dc RUTA_DUMP/glpi10_origen.sql.gz | \
  sudo docker compose exec -T db sh -c \
  'MYSQL_PWD="$MARIADB_PASSWORD" exec mariadb -u"$MARIADB_USER" "$MARIADB_DATABASE"'
```

Si falla, **no reintentar sobre una base parcialmente importada**: recopilar logs, descartar SOLO la base de staging identificada, reconstruirla de manera controlada y repetir importación. Nunca ejecutar eliminación en el origen.

### D.2 Archivos, configuración y claves

- Encontrar la ruta `files` real del GLPI 10. Copiar **el contenido** a `/opt/glpi12-migracion/data/glpi/files/`, preservando fechas/archivos. Ejemplo si la fuente es `/var/www/glpi/files`:

```bash
sudo rsync -aH --numeric-ids /var/www/glpi/files/ \
  /opt/glpi12-migracion/data/glpi/files/
```

- Copiar la configuración original pertinente y claves del directorio real `config` al nuevo `data/glpi/config`, **excluyendo `config_db.php`** (debe apuntar a la BD Docker), así como cualquier ruta hardcodeada incompatible. Revisar `inc/downstream.php` solo para entender la distribución anterior; la imagen Docker ya define las rutas.

```bash
# EJEMPLO: adaptar ORIGEN_CONFIG; no ejecutar sin verificar la ubicación.
sudo rsync -a --exclude='config_db.php' ORIGEN_CONFIG/ \
  /opt/glpi12-migracion/data/glpi/config/
sudo chown -R 33:33 /opt/glpi12-migracion/data/glpi
sudo find /opt/glpi12-migracion/data/glpi -type d -exec chmod 750 {} +
```

- No trasladar `plugins` de GLPI 10 directamente a `/var/www/glpi/plugins`. Para versiones compatibles utilizar marketplace o un montaje separado tras evaluar las migraciones especiales.
- Comprobar que están presentes `glpicrypt.key` y cualquier otra clave/certificado requerido por la instalación original. Verificar cifrado (correo y LDAP) con pruebas tras actualizar.

### D.3 Configuración de BD y actualización explícita

```bash
cd /opt/glpi12-migracion
sudo docker compose up -d glpi
sudo docker compose logs --tail=80 glpi
```

Crear la configuración con el comando **real** de GLPI (`database:configure` o `db:configure`). Se recomienda que el agente solicite al administrador introducir la contraseña en terminal, evitando exponerla en la línea de comandos/historial:

```bash
sudo docker compose exec glpi php bin/console database:configure \
  --db-host=db --db-port=3306 --db-name=glpi \
  --db-user=glpi --db-password
```

Verificar que `data/glpi/config/config_db.php` existe y conecta a **db**, no a localhost ni al motor antiguo. A continuación:

```bash
sudo docker compose exec glpi php bin/console database:update --no-interaction
sudo docker compose exec glpi php bin/console system:check_requirements
sudo docker compose exec glpi php bin/console database:check_schema_integrity
sudo docker compose logs --tail=100 glpi
```

`database:update` es el comando confirmado; no emplear `db:install` (crea una instalación nueva y puede invalidar la restauración). Si `database:check_schema_integrity` presenta discrepancias, diagnosticarlas antes de seguir; nunca aplicar `--force` a ciegas.

### D.4 Tratamiento de plugins especiales

Si se detectó Formcreator y/o Generic Objects, **detener esta ruta estándar hasta disponer de rama validada**. GLPI 11 integra estas funciones en núcleo y las guías oficiales exigen migraciones específicas **partiendo de los datos de GLPI 10 y con el plugin apropiado**. Procedimientos oficiales:

- `php bin/console migration:formcreator_plugin_to_core`
- `php bin/console migration:genericobject_plugin_to_core`

Los dos comandos no se ejecutan por el mero hecho de existir un directorio antiguo: verificar precondiciones, compatibilidad, orden y resultado. Puede ser necesario montar temporalmente un GLPI 11 con plugin específico; hacerlo sobre **otra copia aislada**, no sobre el único dump. Igual criterio con otros plugins de migración peculiar.

**Puerta D:** login de administrador GLPI 12, versión correcta, esquema íntegro o incidencias justificadas, tickets y adjuntos navegables, sin emails de prueba hacia usuarios reales.

## 5. Fase E — Auditoría exhaustiva de datos preservados

Crear un informe de diferencias *origen vs. staging* con números y capturas/evidencias:

| Conjunto | Control obligatorio |
|---|---|
| Tickets | número total, abiertos/cerrados, fechas, categorías, seguimiento, tareas, solución, solicitante/asignado |
| Adjuntos | conteo de documentos, archivo físico accesible, ejemplos de descarga |
| Usuarios/LDAP | usuarios activos/inactivos, grupos, perfiles, entidades, acceso controlado y posterior prueba LDAP |
| Activos no PC | impresoras, switches, monitores, teléfonos, licencias, contratos, proveedores, ubicaciones |
| Historial PC | tickets enlazados a ordenadores, relaciones y equipos afectados |
| Automatizaciones | tareas, reglas, notificaciones, correo, API, integraciones externas |
| Plugins | funciones equivalentes o plan de adaptación de cada uno |
| Seguridad | usuarios locales, permisos, claves preservadas, HTTPS previsto, secretos protegidos |

Pruebas obligatorias: abrir al menos 10 tickets seleccionados de distintas épocas y estados; descargar adjuntos; comprobar relaciones de 5 equipos con tickets; probar consulta de perfiles y permisos (sin provocar notificaciones); comprobar caracteres acentuados; revisar registros de error de Apache/PHP y logs internos. No dar por buena la migración con el mero hecho de que aparezca la pantalla de login.

**Puerta E:** discrepancias documentadas, cero pérdida involuntaria de información y conformidad administrativa para pasar a depuración.

## 6. Fase F — Inventario operativo desde cero SIN destruir el histórico

**Principio:** distinguir `inventario operativo nuevo` de `historial de equipos ligado a tickets`. No ejecutar `DELETE FROM glpi_computers` ni borrados SQL en cascada.

### F.1 Informe de impacto antes de depurar

Exportar los PC existentes con ID, nombre, serial, UUID, estado, entidad, fecha de última actualización, vínculos con `glpi_items_tickets`, documentos, contratos, software, periféricos y elementos de red. Separar:

- **Grupo H:** ordenadores referenciados por tickets/otros registros históricos: conservar como históricos; evaluar estado específico `Inventario anterior` y filtros/vistas. No mover de entidad ni cambiar identificadores sin revisar derechos y relaciones.
- **Grupo E:** ordenadores sin vínculos ni valor histórico: candidatos a papelera y eliminación definitiva **solo previa autorización**.
- **Grupo R:** registros duplicados/corruptos: investigar y decidir qué registro conserva referencias antes de consolidar, renombrar o eliminar.

### F.2 Limpieza mediante interfaz/API soportada

1. Crear/identificar un estado `Inventario anterior` y poner en ese estado los candidatos históricos mediante acciones masivas o API validada.
2. Configurar filtros guardados para que el listado de trabajo muestre únicamente los equipos activos y detectados por GLPI Agent; verificar visibilidad para perfiles técnicos.
3. En una copia de pruebas, marcar lotes E para papelera, comprobar el resultado y conservar exportación. No vaciar la papelera hasta aprobación.
4. Definir reglas de importación/enlace para no crear duplicados ni reactivar accidentalmente registros históricos. **Probar coincidencias reales con serial/UUID antes de desplegar masivamente**; cambiar entidades por defecto puede alterar permisos históricos.
5. Conservar recuentos y una lista reversible de cambios: ID, estado anterior, estado nuevo y motivo.

Si el objetivo exigiese la tabla de ordenadores absolutamente vacía, el agente debe presentar una evaluación explícita del impacto sobre enlaces de tickets y solicitar una decisión distinta. **La opción recomendada es inventario operativo limpio y archivo histórico preservado.**

### F.3 Configurar agente

- Utilizar inventario nativo del núcleo. Instalar `GLPI Inventory` (versión compatible con GLPI 12, comprobada: 1.7.0) **solo** para tareas avanzadas necesarias: descubrimiento de red/SNMP, despliegue, etc.
- GLPI 12 requiere seleccionar modalidad de autenticación para inventarios. En producción elegir OAuth `client_credentials` con alcance `inventory`, TLS y credenciales rotables; evitar modo anónimo expuesto.
- Instalar GLPI Agent en 3-5 equipos piloto de departamentos distintos; confirmar campos de HW/SW, propietario, sede, serial, UUID, asignación de entidad, red, software y ausencia de duplicados.
- Una vez migrado a la VM definitiva, planificar despliegue masivo mediante GPO de Active Directory con MSI oficial y configuración protegida. **No enviar agentes al staging paralelo** mientras exista el GLPI 10 de producción, salvo pilotos controlados expresamente.

**Puerta F:** inventario operativo utilizable y auditado; histórico preservado; cinco equipos piloto correctos; no se ejecutaron borrados irreversibles.

## 7. Fase G — Ensayo de traslado Docker a la VM

Provisión recomendada: Ubuntu Server 24.04 LTS, Docker Engine + Compose plugin, recursos acordes a inventario real (punto de partida orientativo: 2-4 vCPU, 4-8 GiB RAM, disco >= datos y margen de crecimiento), IP fija, DNS, HTTPS, NTP, backup externo y monitoreo. Evitar puertos de BD publicados.

**Preferir transferencia lógica para MariaDB**: NO transportar ni copiar en caliente el directorio `/var/lib/mysql` de un motor funcionando. Usar `mariadb-dump` + restore en motor nuevo del mismo release mayor y `rsync` de archivos de aplicación. Transferir `compose.yaml`, `.env` por canal seguro, `data/glpi` y registro de digest de imágenes.

### G.1 Dump de staging

```bash
cd /opt/glpi12-migracion
sudo docker compose exec -T db sh -c \
  'MYSQL_PWD="$MARIADB_PASSWORD" exec mariadb-dump --single-transaction --quick \
   --routines --triggers --events "$MARIADB_DATABASE"' \
  | gzip -1 > /RUTA_PRIVADA/glpi12_staging.sql.gz
```

Verificar `PIPESTATUS` del shell con `set -o pipefail`, `gzip -t` y tamaño/hash. Para obtener una copia plenamente coherente de DB + adjuntos, **detener escrituras de GLPI durante la toma** o usar procedimiento coordinado de snapshots.

### G.2 Transferencia y restore

1. En la VM nueva instalar Docker/Compose y crear `/opt/glpi12-migracion`.
2. Transferir de forma cifrada `compose.yaml`, `.env` (modo 600), `data/glpi/` (con UID/GID correctos) y el dump SQL. Usar `rsync -aH` por SSH en una parada coherente. Copiar plugins adicionales solo si validados y compatibles.
3. Crear el contenedor `db` con **volumen nuevo y vacío**, restaurar dump lógico con el mismo patrón `mariadb -u ...` de la sección D.1.
4. Arrancar GLPI, revisar que `data/glpi/config/config_db.php` sigue apuntando al servicio `db`, y probar acceso restringido por túnel; **no volver a correr `database:update` a ciegas** si BD ya es GLPI 12.
5. Verificar comparación de recuentos, adjuntos, integraciones y hash de archivos.
6. En pruebas, la nueva VM debe seguir con cron inactivo y envíos de correo deshabilitados.

**Puerta G:** traslado reproducible probado sin afectar GLPI 10. Guardar pasos corregidos y mediciones reales en el acta.

## 8. Fase H — Corte definitivo (requiere autorización y ventana acordada)

**Atención:** el ensayo estará desactualizado si GLPI 10 ha seguido recibiendo tickets. No usar el dump de ensayo como origen definitivo.

1. Comunicar ventana; congelar el GLPI 10 (modo mantenimiento o bloqueo efectivo de escrituras), detener recepción de nuevos tickets vía correo y tareas programadas del GLPI 10. Verificar que usuarios y sistemas ya no pueden modificar el origen.
2. Obtener **nueva copia final** de base de datos GLPI 10 y `files`/config/claves, con hashes y pruebas. Conservar el GLPI antiguo intacto como respaldo, no borrarlo.
3. Repetir **sobre un staging limpio/restaurado desde esa última copia** la actualización a GLPI 12 y el guion de depuración ya ensayado; ejecutar comparaciones E/F.
4. Extraer dump lógico de GLPI 12 definitivo y archivos, transferirlos a la VM y restaurarlos en DB de destino nueva. No sobreescribir silenciosamente un destino con otros datos: respaldar y reinicializar **solo el proyecto Docker autorizado**.
5. Verificar 10 tickets, adjuntos, perfiles, autenticación LDAP, correos desactivados, inventario y demás controles.
6. Configurar proxy HTTPS/FQDN, DNS o IP virtual hacia la VM nueva; comprobar acceso desde usuario y agentes; levantar cron y notificaciones **una única vez en la VM nueva**. Revisar URL base y endpoints de inventario. Si el proxy inverso reside en **otra máquina**, cambiar en el `.env` de la VM `GLPI_BIND_IP` desde `127.0.0.1` a la **IP privada de la VM**, limitar por firewall de red el puerto 18080 a la IP del proxy y recrear el contenedor GLPI; Docker puede alterar reglas NAT/iptables y el firewall local por sí solo podría no bloquear puertos publicados. Si el proxy reside en la misma VM, mantener `127.0.0.1` y hacer proxy a `http://127.0.0.1:18080`. Nunca publicar 18080 indiscriminadamente.
7. Mantener GLPI 10 fuera de servicio y **no editable**, pero conservado hasta el fin del periodo de estabilización. Detener cualquier GLPI 12 de staging previo para no tener múltiples sistemas activos.
8. Planificar migración GPO de agentes y vigilancia inicial de logs, tareas pendientes, colas de correo e integraciones externas.

**Puerta H:** acta de aceptación y prueba de recuperación. Solo entonces designar VM nueva como producción.

## 9. Rollback y recuperación ante incidentes

### Durante pruebas

- Simplemente detener **solo** el proyecto Docker de staging: `cd /opt/glpi12-migracion && sudo docker compose stop`.
- El GLPI 10 y sus servicios no se han modificado. No usar `down -v`.

### Durante el corte

- Si falla antes de reabrir la VM a usuarios: mantener nueva VM cerrada, recuperar el GLPI 10 desde su estado previo (descongelar usuarios y tareas), reanudar correo entrante y anunciar rollback.
- Si la nueva VM ya admitió tickets/cambios: **no volver a GLPI 10 sin decidir cómo preservar/reconciliar esos nuevos datos**. Congelar la nueva instancia, respaldarla y diseñar recuperación; las BD de GLPI 10 y GLPI 12 no son intercambiables ni existe downgrade de esquema fiable.
- Guardar copias con fecha, hashes y procedimiento de recuperación probado; definir RPO/RTO de acuerdo con el Ayuntamiento.

## 10. Copias diarias y operación futura

- Programar dump lógico de MariaDB + copia de `data/glpi`, secretos y `compose.yaml` de forma consistente.
- Enviar una copia fuera de la VM, cifrada, con retención aprobada, prueba periódica de restauración y supervisión de errores.
- Vigilar backups, espacio, certificados HTTPS, logs Docker, disponibilidad web, estado BD, colas y ejecución de cron.
- Mantener la versión `12.0.1` fijada durante la migración. Posteriores actualizaciones se harán con ensayo, copia completa, revisión de notas, digest y ventana de mantenimiento; no aplicar `latest` automático.
- Si se usan snapshots de VMware, emplearlos como protección adicional de corta duración, nunca como único backup.

## 11. Entregables del agente

1. `inventario_origen.md`: sistema, rutas, plugins, DB, integraciones, seguridad y riesgos, **sin secretos**.
2. `backup_origen.md`: ubicación, hashes, tamaños, verificación y prueba de restauración (sin copiar datos sensibles al informe).
3. `registro_comandos.md`: órdenes ejecutadas, fecha, resultado, errores y correcciones; ocultar contraseñas.
4. `comparacion_datos.csv` y `validacion_funcional.md`: recuentos y muestreo de tickets, adjuntos y activos.
5. `plan_depuracion_equipos.csv`: ID/estado/relaciones y propuesta de conservación o retirada, sin borrar automáticamente.
6. `acta_corte.md`: ventana, pasos, responsables, incidencias, DNS/TLS, prueba de rollback y aceptación.
7. `operacion_y_backup.md`: recuperación, retención, monitorización y guion de actualización futuro.

## 12. Puntos de detención obligatorios

**Solicitar autorización humana explícita si es necesario:**

- detención/modificación de Apache, MariaDB, cron, correo o GLPI 10;
- cambios en DNS, HTTPS/proxy, VPN/firewall o dirección oficial del GLPI;
- borrado de equipos con vínculos históricos, vaciado de papelera o modificación masiva de entidades;
- ejecución de migraciones especiales de plugins sin una copia y plan verificados;
- corte final y aceptación de su ventana;
- sustitución de una base de datos de destino que ya contenga datos.

**Si falta capacidad de CPU/RAM/disco o la instancia vieja y Docker compiten por el mismo servicio, detener el plan y sugerir desplegar primero en la nueva VM.**

## 13. Prompt breve de arranque para entregar junto al procedimiento

> Actúa como administrador de sistemas Linux, Docker y GLPI especializado en migraciones con preservación histórica y mínima indisponibilidad. Tu misión es seguir fielmente `PROCEDIMIENTO_GLPI12_DOCKER.md` y los archivos `compose.yaml` y `env.example`. Comienza con la Fase A, muestra evidencia de cada control y no avances cuando una puerta resulte NO APTA. GLPI 10.0.28 está en producción en este mismo Ubuntu y no debes alterar ni detener sus servicios durante las fases de prueba. Migra datos completos a GLPI 12.0.1 en contenedores aislados, conserva tickets y demás activos, depura solamente el inventario operativo de ordenadores sin destruir relaciones históricas, ensaya el traslado a nueva VM y solicita autorización antes de cualquier acción con efecto sobre producción. No muestres secretos. Registra todas las diferencias de datos, los comandos efectivamente ejecutados y el plan de recuperación.

## 14. Documentación oficial de referencia (comprobada el 10/11/2026)

- GLPI 12, actualización directa 10→12 y requisitos: https://www.glpi-project.org/en/glpi-12-release/
- Repositorio oficial Docker y variables: https://github.com/glpi-project/docker-images/blob/main/README.md
- Imagen Docker oficial `12.0.1`: https://github.com/glpi-project/docker-images/pkgs/container/glpi
- GLPI CLI (`database:configure`, `database:update`, chequeos): https://help.glpi-project.org/documentation/cli
- FAQ instalación / copias / `glpicrypt.key`: https://help.glpi-project.org/faq/glpi/installation_update
- Cambios GLPI 12, inventario y plugins: https://www.glpi-project.org/en/glpi-12/
- Formcreator, migración especial: https://help.glpi-project.org/documentation/modules/administration/forms
- Generic Objects, migración especial: https://help.glpi-project.org/documentation/modules/configuration/asset-definitions
- OAuth para GLPI Agent: https://help.glpi-project.org/documentation/modules/configuration/oauth-clients
- GLPI Inventory compatible con GLPI 12: https://github.com/glpi-project/glpi-inventory-plugin/blob/main/glpiinventory.xml
