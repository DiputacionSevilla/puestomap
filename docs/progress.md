# Progreso

Ejecución de `puestomap-sdd/tasks.md` (una fila por fase).

| Fase | Estado | Notas |
|---|---|---|
| F0 Base del proyecto | en curso | |
| F1 Datos, seguridad y utilidades | pendiente | |
| F2 Inventario y estructura | pendiente | |
| F3 Worker: OCS y sondeo | pendiente | |
| F4 Mapa | pendiente | |
| F5 Asistencia remota | pendiente | |
| F5b Multipantalla | pendiente | |
| F6 Cierre v1 | pendiente | |

## Pendientes que requieren intervención humana ([STOP])
- T-20: JSON real de OCS para validar el mapper (`specs/05-integraciones.md` §1.1).
- T-42: piloto de multipantalla en un PC con doble monitor (`specs/09-multipantalla.md` §7).
- T-38: checklist de aceptación manual con red real (`specs/08-tests.md` §5).
- T-63: carga real de ubicaciones/planos/equipos con la checklist de `specs/10` §13.

## Reconciliación CR-01 (T-50, 2026-11-09)

| Tarea previa | Estado | Delta pendiente (CR-01) |
|---|---|---|
| T-05 Modelo Prisma | hecha | Campos `adUsername`, `lastUserNorm`, modelo `DirectoryUser`, campos nuevos de `RemoteSession` → T-51 |
| T-07 packages/shared | hecha | `keys`, `ad-user`, `name-match`, `geo` ampliado, `svg-validate` + tests T-U12…T-U15 → T-52 |
| T-11 Planos | hecha (básica) | Validación SVG §5.4, cabeceras CSP/nosniff, aviso de proporción → T-53 |
| T-12/T-13 Listado | hecha | Columna usuario dominio, filtro `check`, búsqueda ampliada → T-60 |
| T-14 Ficha | hecha | Bloque "Usuario" con autocompletado/sugerencias, marca de discrepancia → T-59/T-60 |
| T-15 Usuarios/credenciales | hecha | Directorio (`/api/directory/*`) → T-59 |
| T-16 Importación CSV | hecha (básica) | Lectura por cabecera, `rect_*`, reglas §5.2, `errores.csv`, idempotencia → T-54/T-55 |
| T-19 Mapper OCS | pendiente (F3) | Incorporar `lastUserNorm` al implementarla (se marca junto a T-19) |
| T-23…T-27 Mapa | pendiente (F4) | Se implementa directamente con T-57 (capa despachos, etiqueta, filtro departamento) |
| T-28/T-30 Gateway y visor | pendiente (F5) | Se implementa directamente con T-62 (resolución DNS, identidad) |
| — | no existía | Asistente `/importar/carga-inicial` (T-56), fixtures y aceptación (T-58), `/calidad` (T-61) |
