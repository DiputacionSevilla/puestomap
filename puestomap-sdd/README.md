# PuestoMap — Pack SDD

Panel web para localizar, inventariar y asistir en remoto los puestos de trabajo del
Ayuntamiento de Mairena del Alcor, reutilizando el TightVNC Server ya desplegado.

Este pack está pensado para que un agente programador (Claude Code u otro) construya la
aplicación completa en bucle agéntico, siguiendo la metodología SDD (Spec-Driven Development):
**la especificación es la fuente de verdad; el código se deriva de ella.**

## Contenido

| Fichero | Para qué sirve |
|---|---|
| `AGENTS.md` | Reglas de trabajo del agente, bucle agéntico, convenciones y puntos de parada |
| `specs/00-vision.md` | Problema, objetivos, alcance y glosario |
| `specs/01-arquitectura.md` | Servicios, flujos, decisiones técnicas y seguridad |
| `specs/02-modelo-datos.md` | Esquema Prisma completo y reglas de datos |
| `specs/03-funcional.md` | Requisitos funcionales con criterios de aceptación |
| `specs/04-api.md` | Contrato de endpoints (route handlers) |
| `specs/05-integraciones.md` | OCS Inventory, sondeo RFB, gateway WebSocket, noVNC, protocolo `tightvnc://`, CSV |
| `specs/06-ui.md` | Pantallas y comportamiento de la interfaz |
| `specs/07-despliegue.md` | Docker Compose, variables, Nginx Proxy Manager, firewall de los puestos |
| `specs/08-tests.md` | Tests mínimos obligatorios |
| `specs/09-multipantalla.md` | Equipos con varias pantallas: puertos extra de TightVNC, descubrimiento, sesiones por pantalla y piloto |
| `tasks.md` | Plan de ejecución por fases con checklist (lo que el agente va marcando) |
| `extras/tightvnc-protocol/` | Scripts PowerShell para registrar el protocolo `tightvnc://` en los PCs de los técnicos |

## Cómo arrancar (Windows)

Prerrequisitos en el equipo de desarrollo: Node.js 22 LTS, Git, Docker Desktop.

```powershell
mkdir C:\dev\puestomap
cd C:\dev\puestomap
# Copia aquí el contenido de este pack (AGENTS.md, specs\, tasks.md, extras\, README.md)
git init
git add .
git commit -m "docs: pack SDD inicial"
claude
```

### Prompt inicial para el agente

```
Lee AGENTS.md y después todos los ficheros de specs/ en orden numérico, y tasks.md.
Ejecuta tasks.md fase a fase siguiendo exactamente el bucle definido en AGENTS.md.
No pidas confirmación entre tareas salvo en las marcadas con [STOP].
Trabajo en Windows con PowerShell: no uses comandos solo-Linux en scripts npm ni en
instrucciones para mí (dentro de los Dockerfile sí puedes usar shell Linux).
Cuando termines una fase, resume en docs/progress.md lo hecho, lo pendiente y los bloqueos.
```

Para retomar en otra sesión:

```
Lee AGENTS.md, docs/progress.md y tasks.md. Continúa por la primera tarea sin marcar.
```

## Datos que conviene tener preparados

1. URL de la API REST de OCS Inventory (`http://<servidor-ocs>/ocsapi/v1`) y usuario/contraseña con acceso.
2. Contraseña común del TightVNC Server de los puestos (si hay varias, cuántas y en qué equipos).
3. Rangos IP de la red de puestos (para la lista blanca del gateway).
4. Planos de cada planta en PNG/JPG/SVG (si están en PDF, exportarlos a PNG a ~150-200 ppp).
5. Relación de edificios, departamentos y despachos (puede cargarse por CSV).
6. IP del servidor `docker1` y de los PCs de los dos técnicos (para la regla de firewall).
7. Un PC de prueba con doble monitor para el piloto de multipantalla (`specs/09-multipantalla.md` §7); conviene hacerlo antes de lanzar al agente.
