# Operación

## Preparación

Requisitos del host: Docker Engine con Compose v2, acceso al repositorio, DNS interno y salida a la
LAN municipal. El repositorio no contiene secretos. Crear `.env` desde `.env.example`, ejecutar
`npm run gen:secrets` y guardar los valores en el gestor de secretos del departamento. Como mínimo,
rellenar `POSTGRES_PASSWORD`, `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_INITIAL_PASSWORD`,
`VNC_ENC_KEY` y `GATEWAY_JWT_SECRET`.

`DATABASE_URL` debe usar el host Compose `db`. `APP_URL` debe ser la URL HTTPS publicada. El seed es
idempotente; en Compose está desactivado por defecto (`SEED_ON_START=false`, ver `docker-compose.yml`)
y solo debe activarse en el primer arranque controlado o ejecutarse a mano con `npm run db:seed`.
Además, el Compose usa las variables **`COMPOSE_APP_URL`** y **`COMPOSE_GATEWAY_PUBLIC_URL`** para el
origen visible por el navegador y la URL pública del gateway (ver `AGENTS.md` §5): en local son
`http://localhost:3100` y `ws://localhost:8181`; detrás de Nginx con `location /vnc-ws`, la primera es
la URL pública y la segunda queda **vacía**.

## Despliegue en docker1

```bash
git clone <repo> /opt/puestomap
cd /opt/puestomap
cp .env.example .env
# Completar .env sin versionarlo
docker compose build
docker compose up -d
docker compose ps
APP_URL=http://localhost:3100 GATEWAY_HEALTH_URL=http://localhost:8181/health ./scripts/smoke.sh
```

Los servicios `db`, `web`, `gateway` y `worker` deben figurar `healthy`. Para una actualización:

```bash
cd /opt/puestomap
git pull --ff-only
docker compose build
docker compose up -d
docker compose ps
```

Las migraciones se aplican antes de iniciar la web. Revisar `docker compose logs web gateway worker`
si un servicio no queda sano. Los logs propios se emiten como una línea JSON a stdout y respetan
`LOG_LEVEL` (`debug`, `info`, `warn` o `error`).

## Nginx Proxy Manager

Crear el Proxy Host interno `puestomap.mairenadelalcor.net` hacia `http://<ip-docker1>:3100`, con
Websockets Support, Block Common Exploits, certificado wildcard, Force SSL y HTTP/2. Aplicar una
Access List que solo permita la red interna, preferiblemente la VLAN de Informática. No publicar un
registro DNS externo.

Configuración avanzada:

```nginx
client_max_body_size 20m;

location /vnc-ws {
    proxy_pass http://<ip-docker1>:8181;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Origin $http_origin;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 4h;
    proxy_send_timeout 4h;
    proxy_buffering off;
}
```

Tras publicar, ejecutar `APP_URL=https://puestomap.mairenadelalcor.net ./scripts/smoke.sh` y, desde
PowerShell, `./scripts/smoke.ps1 -AppUrl https://puestomap.mairenadelalcor.net`.

## Firewall / GPO de los puestos

Crear por GPO una regla de entrada TCP para `5900-5904`, limitada a la IP de `docker1` y a las IP de
los dos PCs técnicos que usan el modo nativo. Bloquear cualquier otro origen. Los puestos ven las
conexiones de los contenedores con la IP del host Docker.

Revisar también el control de acceso por IP de TightVNC Server, si la versión instalada lo permite,
y valorar la confirmación del usuario para asistencia atendida. Usar una contraseña VNC por grupo,
gestionada en PuestoMap. El protocolo VNC clásico no cifra el tráfico y limita la contraseña a ocho
caracteres; la restricción de red es obligatoria. Informar a la plantilla de los accesos de soporte y
de su registro de auditoría.

El despliegue por GPO de pantallas adicionales pertenece a T-49 y no debe aplicarse hasta completar
el piloto T-42.

## Copias de seguridad

Programar diariamente en el host un `pg_dump` y una copia del volumen `uploads`, con retención mínima
de 14 días. Ejemplo de volcado consistente:

```bash
docker compose exec -T db pg_dump -U puestomap -d puestomap -Fc > /ruta-segura/puestomap-$(date +%F).dump
docker compose exec -T web tar czf - -C /data/uploads . \
  > /ruta-segura/uploads-$(date +%F).tgz
```

Guardar también `.env` y `VNC_ENC_KEY` en el gestor de secretos, fuera de la copia ordinaria. Probar
trimestralmente la restauración en un entorno aislado. Para restaurar, detener primero los servicios
que escriben, restaurar PostgreSQL con `pg_restore` y reponer el contenido del volumen `uploads`.

## Rotación de secretos

1. Generar nuevos valores con `npm run gen:secrets` y actualizar el gestor de secretos.
2. `AUTH_SECRET`: invalida sesiones web activas. `GATEWAY_JWT_SECRET`: invalida tokens de conexión de
   hasta 60 segundos. Cambiarlos en `.env` y recrear `web` y `gateway` juntos.
3. `POSTGRES_PASSWORD`: cambiar primero la contraseña en PostgreSQL, actualizar
   `POSTGRES_PASSWORD`/`DATABASE_URL` y recrear los servicios.
4. `VNC_ENC_KEY` no se sustituye directamente: las credenciales VNC existentes quedarían
   indescifrables. Antes de rotarla, volver a guardar todas las credenciales con la nueva clave en una
   ventana controlada y conservar temporalmente la anterior para reversión.
5. Cambiar `ADMIN_INITIAL_PASSWORD` en la aplicación tras el primer acceso; no reutilizarlo como
   contraseña operativa ni dejar el seed habilitado por ese motivo.

Después de cualquier rotación ejecutar los smokes y comprobar login y apertura del diálogo de
asistencia, sin iniciar una conexión real fuera de una ventana autorizada.

## Enlace «Asistencia remota» desde GLPI (RF-22)

En GLPI: *Configuración → Enlaces externos → Añadir* (no requiere plugin).

- Nombre: `Asistencia remota`
- Enlace: `https://<puestomap>/equipos/glpi/[ID]`
- Tipos de elemento: Equipo

Al pulsarlo desde la ficha de un equipo, PuestoMap pide sesión si hace falta (vuelve al mismo
destino tras el login) y redirige a la ficha. Si el equipo aún no se ha sincronizado muestra
«Todavía no sincronizado» sin revelar datos. Variante por nombre: `/equipos/glpi?name=[NAME]`.
Para los botones «Abrir en GLPI» de PuestoMap, configurar `GLPI_PUBLIC_URL` (con `/glpi`).
En el visor, un motivo como `#1234` se enlaza al ticket de GLPI en el historial de sesiones.
