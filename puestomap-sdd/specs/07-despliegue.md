# 07 — Despliegue

## 1. Destino
Servidor `docker1` (red interna), detrás del **Nginx Proxy Manager** existente con certificado
wildcard `*.mairenadelalcor.net`. Nombre propuesto: `puestomap.mairenadelalcor.net`, resuelto
**solo en el DNS interno** (no crear registro en el DNS público).

## 2. Dockerfile único (raíz) con targets

- `base`: `node:22-alpine`, `npm ci` con workspaces, `prisma generate`.
- `web`: `next build` con `output: "standalone"`; runtime mínimo con usuario no root;
  entrypoint: `prisma migrate deploy` y después `node server.js`.
- `gateway`: build TS → `node dist/index.js`.
- `worker`: build TS → `node dist/index.js`.
- Todos: `HEALTHCHECK`, `NODE_ENV=production`, `TZ=Europe/Madrid`.

## 3. `docker-compose.yml` (producción)

```yaml
name: puestomap
services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: puestomap
      POSTGRES_USER: puestomap
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      TZ: Europe/Madrid
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U puestomap -d puestomap"]
      interval: 10s
      retries: 5

  web:
    build: { context: ., target: web }
    image: puestomap-web:latest
    restart: unless-stopped
    env_file: .env
    depends_on: { db: { condition: service_healthy } }
    volumes:
      - uploads:/data/uploads
    ports:
      - "3100:3000"

  gateway:
    build: { context: ., target: gateway }
    image: puestomap-gateway:latest
    restart: unless-stopped
    env_file: .env
    depends_on: { db: { condition: service_healthy } }
    ports:
      - "8181:8081"

  worker:
    build: { context: ., target: worker }
    image: puestomap-worker:latest
    restart: unless-stopped
    env_file: .env
    depends_on: { db: { condition: service_healthy } }

volumes:
  pgdata:
  uploads:
```

`docker-compose.dev.yml`: solo `db` con puerto `5432` publicado en `127.0.0.1`.

Los contenedores salen a la LAN por NAT del bridge de Docker; los puestos verán las conexiones
VNC y de sondeo **con la IP de `docker1`** (relevante para el firewall, §6).

## 4. Variables de entorno (`.env.example`)

```dotenv
# Base de datos
POSTGRES_PASSWORD=cambiar
DATABASE_URL=postgresql://puestomap:cambiar@db:5432/puestomap

# Web
APP_URL=https://puestomap.mairenadelalcor.net
AUTH_SECRET=                       # openssl rand -base64 32 (o Node: crypto.randomBytes(32).toString('base64'))
AUTH_TRUST_HOST=true
UPLOADS_DIR=/data/uploads
ADMIN_INITIAL_USER=admin
ADMIN_INITIAL_PASSWORD=            # solo para el primer arranque (seed); cambiar tras entrar

# Cifrado de contraseñas VNC (32 bytes en base64). NO perder: sin ella no se descifran.
VNC_ENC_KEY=

# Gateway
GATEWAY_PORT=8081
GATEWAY_JWT_SECRET=
ALLOWED_CIDRS=10.0.0.0/8,192.168.0.0/16
SESSION_IDLE_TIMEOUT_MIN=30
SESSION_MAX_HOURS=4

# Worker
OCS_API_URL=http://ocs.local/ocsapi/v1
OCS_API_USER=
OCS_API_PASSWORD=
OCS_SYNC_CRON=0 */2 * * *
PROBE_INTERVAL_MIN=5
PROBE_CONCURRENCY=32
PROBE_TIMEOUT_MS=1500
PROBE_ONLINE_PORTS=445,135,3389
VNC_DEFAULT_PORT=5900
VNC_ALLOWED_PORTS=5900-5909
PROBE_SCREEN_MAX=4

LOG_LEVEL=info
```

Script `npm run gen:secrets` (Node, multiplataforma) que imprime valores aleatorios para
`AUTH_SECRET`, `GATEWAY_JWT_SECRET` y `VNC_ENC_KEY`.

## 5. Nginx Proxy Manager

Proxy Host `puestomap.mairenadelalcor.net`:
- Forward: `http://<ip-docker1>:3100`, **Websockets Support: ON**, Block Common Exploits: ON.
- SSL: certificado wildcard existente, Force SSL, HTTP/2.
- **Access List**: permitir solo rangos internos (y opcionalmente solo la VLAN de Informática).
- Pestaña *Advanced* (configuración personalizada):

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

El gateway toma la IP del cliente de `X-Forwarded-For` (primer valor) solo si la conexión llega
desde la IP del proxy (`TRUSTED_PROXY_IPS`, opcional).

## 6. Configuración recomendada en los puestos (operación, no código)

Documentar en `docs/operacion.md`:

1. **Firewall de Windows por GPO**: regla de entrada TCP 5900-5904 (principal + una por pantalla, ver `09-multipantalla.md`) permitida **solo** desde la IP de
   `docker1` y las IP de los PCs de los dos técnicos (modo nativo). Bloquear el resto.
   El tráfico VNC clásico no va cifrado y la contraseña VNC es de 8 caracteres como máximo, por
   lo que restringir el origen es la principal medida de seguridad.
2. **TightVNC Server**: revisar en su configuración el control de acceso por IP (si la versión
   instalada lo ofrece) para replicar la restricción anterior y valorar la opción de pedir
   confirmación al usuario del puesto antes de aceptar la conexión (asistencia atendida).
3. Contraseña VNC homogénea por grupo de equipos, gestionada en PuestoMap (RF-14).
4. Informar a la plantilla, conforme a la normativa de protección de datos, de que el soporte
   técnico puede acceder remotamente a los puestos y de que esos accesos quedan registrados.

## 7. Puesta en marcha en `docker1`

```bash
git clone <repo> /opt/puestomap && cd /opt/puestomap
cp .env.example .env   # rellenar
docker compose build
docker compose up -d
docker compose exec web node packages/db/dist/seed.js   # o el comando que defina el agente
docker compose ps      # los 4 servicios healthy
```
(En `docker1`, Linux; si se despliega desde Windows usar los mismos comandos `docker compose`
en PowerShell salvo `cp` → `Copy-Item`.)

Smoke post-despliegue: `scripts/smoke.ps1` y `scripts/smoke.sh` comprueban
`https://…/api/health` y `http://docker1:8181/health`.

## 8. Copias de seguridad
- `pg_dump` diario (cron del host o contenedor `prodrigestivill/postgres-backup-local`) con
  retención 14 días.
- Copia del volumen `uploads` (planos).
- Guardar `VNC_ENC_KEY` y `.env` en el gestor de secretos del departamento.
