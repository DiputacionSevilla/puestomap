# 00 — Visión, objetivos y alcance

## 1. Contexto

El departamento de Informática del Ayuntamiento de Mairena del Alcor (2 técnicos) da soporte a
un parque de PCs Windows repartidos en varios edificios. La mayoría de los puestos tienen
**TightVNC Server** instalado como servicio, y los técnicos conectan con **TightVNC Viewer**
introduciendo IP o nombre a mano. El parque está inventariado con **OCS Inventory** (agente
desplegado en los equipos) y se trabaja con GLPI.

## 2. Problema

- No hay una vista única que diga qué equipos tienen TightVNC instalado y operativo y cuáles no.
- Localizar el equipo de una persona (edificio, planta, despacho) y su IP actual es lento.
- La información técnica está en OCS, pero la **ubicación física** no está en ningún sitio útil.
- No queda registro de quién se conectó a qué equipo ni cuándo.

## 3. Objetivos (medibles)

| ID | Objetivo |
|---|---|
| OBJ-1 | Iniciar una asistencia remota a cualquier equipo en **≤ 3 clics** desde el listado o el plano |
| OBJ-2 | Conocer en todo momento el estado VNC de cada equipo (instalado / responde / no instalado / desconocido) |
| OBJ-3 | Ubicar cada equipo en el plano de su planta, con edificio, departamento y despacho |
| OBJ-4 | Datos técnicos (IP, usuario, SO, hardware) sincronizados automáticamente desde OCS |
| OBJ-5 | Registro auditable de todas las sesiones remotas |
| OBJ-6 | Despliegue en Docker en el servidor `docker1`, publicado vía Nginx Proxy Manager |

## 4. Usuarios

| Rol | Quién | Permisos |
|---|---|---|
| `ADMIN` | Responsable de Informática | Todo, incluida gestión de usuarios y credenciales VNC |
| `TECH` | Técnicos de soporte | Consultar, ubicar equipos, editar fichas, iniciar asistencia |
| `VIEWER` | (opcional) Consulta | Solo lectura; no puede iniciar asistencia |

## 5. Alcance

### Incluido (v1)
- Inventario de equipos sincronizado desde OCS + alta manual + importación CSV.
- Estructura física: edificios → plantas (con plano) → despachos; departamentos transversales.
- Mapa interactivo por planta sobre imagen del plano, con colocación de equipos por arrastre.
- Listado con filtros y búsqueda; ficha detallada de equipo.
- Detección del estado VNC y de conectividad mediante sondeo TCP/RFB y datos de OCS.
- Asistencia remota **desde el navegador** (noVNC a través de un gateway propio).
- Asistencia remota con **TightVNC Viewer nativo** mediante protocolo `tightvnc://`.
- Auditoría de sesiones y de cambios relevantes.
- Panel de indicadores (KPIs).

### Fuera de alcance (v1)
- Instalar o actualizar TightVNC en los puestos (sí se informa de qué equipos no lo tienen).
- Grabación de sesiones en vídeo.
- Transferencia de ficheros.
- Acceso desde fuera de la red municipal.
- Integración bidireccional con GLPI (se deja preparado el campo `externalRef`).
- Autenticación contra Active Directory/LDAP (prevista para v2; el diseño no debe impedirla).

## 6. Glosario

| Término | Significado |
|---|---|
| RFB | Protocolo de VNC. El servidor saluda con `RFB 003.008\n` (12 bytes) |
| Gateway | Servicio propio que traduce WebSocket (navegador) ↔ TCP (puerto VNC del puesto) |
| noVNC | Cliente VNC en JavaScript que se ejecuta en el navegador |
| Sondeo | Comprobación TCP desde el servidor a los puertos de un equipo |
| Puesto / equipo | PC de trabajo de un empleado |
| Despacho | Estancia física dentro de una planta (`Office` en el modelo) |
