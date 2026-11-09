# 09 — Equipos con varias pantallas

Complementa 02 (modelo), 03 (RF-15), 04 (API), 05 (gateway) y 07 (despliegue).

## 1. Problema y decisión

TightVNC Server publica por defecto **todo el escritorio virtual de Windows como una sola imagen**
(los monitores quedan unidos). El visor no puede separarlos: hay que hacerlo en el servidor.

TightVNC permite dos mecanismos: elegir el adaptador de pantalla por línea de comandos
(`-sharedisplay N`, temporal) y asociar un **desplazamiento/pantalla a un puerto extra**
(*Configuration → Extra Ports*, persistente).

| Opción | Valoración |
|---|---|
| A. Puerto extra → **número de pantalla** | **Elegida.** Persistente, independiente de resolución y disposición de monitores, una conexión por pantalla |
| B. Puerto extra → rectángulo (`WxH+X+Y`) | Fallback si la numeración de A no coincide con los monitores. Frágil: cambia si se cambia resolución/disposición |
| C. `-sharedisplay` por línea de comandos | Solo para pruebas: se pierde al reiniciar el servicio |
| D. Cambiar de servidor VNC (UltraVNC…) | Descartada: obliga a reinstalar en todo el parque |

La idea de abrir **una sesión por pantalla** es correcta. Mejoras incorporadas:
detección automática de equipos multipantalla, sesiones agrupadas para auditoría, tres modos de
visualización y el escritorio completo unido como alternativa.

## 2. Convención de puertos

| Puerto | Contenido |
|---|---|
| 5900 | Escritorio completo (comportamiento actual; el modo nativo y el resto de funciones siguen igual) |
| 5901 … 5904 | Pantalla 1 … 4 (`5900 + índice`) |

Máximo soportado: 4 pantallas. La misma contraseña VNC sirve para todos los puertos.

## 3. Detección y descubrimiento

1. **Pista desde GLPI** (OCS retirado, CR-02): `monitorCount` = nº de `Computer_Item` de tipo `Monitor` no borrados
   (`GET Computer/{id}/Computer_Item`). Si la consulta falla, el valor guardado no se pisa.
   Es solo una pista (puede incluir monitores desconectados o la pantalla interna de un portátil).
2. **Descubrimiento por sondeo** (worker, cada 6 h y bajo demanda):
   - Candidatos: equipos `online` con `monitorCount > 1` o que ya tengan pantallas.
   - Sondear 5901…`5900 + PROBE_SCREEN_MAX` (def. 4) con `probeComputer` (solo banner RFB).
   - Cada puerto con banner correcto → upsert `ComputerScreen {index, port, label:"Pantalla N", source:PROBE}`.
   - Una pantalla `source = PROBE` que deja de responder durante 7 días se marca `enabled=false`
     (no se borra; las `MANUAL` nunca se tocan).
3. **Estado multipantalla derivado** (`shared/screens.ts`, función pura `deriveMultiState`):

   | Estado | Condición |
   |---|---|
   | `SINGLE` | `monitorCount` ≤ 1 o desconocido y sin pantallas configuradas |
   | `MULTI_OK` | ≥ 2 pantallas habilitadas |
   | `MULTI_PENDING` | `monitorCount > 1` y < 2 pantallas habilitadas (falta configurar el servidor) |

4. El sondeo normal (RF-09) sondea además los puertos de las pantallas habilitadas de cada equipo
   y actualiza `ComputerScreen.reachable/lastProbeAt/lastOkAt`.

## 4. Sesiones, gateway y auditoría

- `RemoteSession` guarda `targetPort`, `screenId`, `screenLabel` y `groupId`.
- El gateway resuelve **IP y puerto desde la fila de `RemoteSession`** (nunca desde el token) y
  rechaza con 4403 un `targetPort` fuera de `VNC_ALLOWED_PORTS` (def. 5900-5909).
- Una sesión por pantalla = una fila de auditoría por pantalla; el `groupId` (uuid generado en el
  cliente al pulsar el botón) permite agruparlas en `/sesiones`.
- Conflicto `SESSION_IN_USE`: solo si hay sesión `ACTIVE` de **otro usuario** en cualquier puerto
  del equipo. Las sesiones propias o del mismo grupo no cuentan.
- Límite: 4 sesiones WEB simultáneas por usuario y equipo.
- noVNC conecta con `shared: true` (valor por defecto); ver §7 para la comprobación en el piloto.

## 5. Interfaz

**Botón de asistencia** en listado, ficha y panel del mapa: si `MULTI_OK`, botón dividido:

```
[ Asistencia ▾ ]  → Todas las pantallas (ventanas)   ← acción por defecto
                    Todas las pantallas (mosaico)
                    Pantalla 1 · Pantalla 2 …
                    Escritorio completo (unido)
```
Si `SINGLE` o `MULTI_PENDING`, el botón actúa como hasta ahora (puerto 5900); en `MULTI_PENDING`
se muestra un aviso "Este equipo parece tener varias pantallas sin configurar".

**Modos del visor** (`/remote/[computerId]?screen=<n|desktop>&group=<uuid>` y
`?screens=all&layout=tiles`):

1. **Ventanas separadas**: el cliente genera `groupId` y abre N ventanas con `window.open`,
   una por pantalla (`?screen=1&group=…`). Cada ventana pide su propia sesión (no se pasan tokens por
   URL), de modo que el técnico puede arrastrar cada ventana a su monitor. Título:
   `HOSTNAME · Pantalla 2`. Si el navegador bloquea las ventanas emergentes, mostrar un panel con un
   botón por pantalla y la indicación de permitir ventanas emergentes para el sitio.
2. **Mosaico**: una sola pestaña con un componente `RfbScreen` por pantalla en rejilla
   (todas visibles, escaladas). El teclado va a la pantalla enfocada.
3. **Escritorio completo**: puerto 5900, la pantalla unida de siempre.

`BroadcastChannel("puestomap-group-<groupId>")`: el botón "Desconectar todas" de cualquier
ventana cierra las demás sesiones del grupo.

**Limitación a documentar en la ayuda**: con una sesión por pantalla el ratón no puede cruzar de
una pantalla a otra, así que no se puede arrastrar una ventana de Windows entre monitores del
equipo remoto. Para eso se usa "Escritorio completo (unido)" o el atajo `Win+Mayús+←/→` en el puesto remoto.

**Modo nativo**: la ficha muestra un enlace `tightvnc://ip:puerto` por pantalla y uno para el
escritorio completo.

**Ficha > pestaña "Pantallas"**: tabla (índice, etiqueta editable —p. ej. "Izquierda", "Derecha"—,
puerto, origen, estado), botones "Detectar pantallas" y "Añadir manualmente".

## 6. Datos

Ver modelo en 02 (`ComputerScreen`, `Computer.monitorCount`, campos de `RemoteSession`).
Reglas: `(computerId, index)` y `(computerId, port)` únicos; `port = 5900 + index` por defecto pero
editable (rango 5901-5909); la etiqueta es editable y nunca la pisa el descubrimiento.

## 7. Configuración en los puestos y piloto `[STOP]`

La sintaxis exacta del campo *Extra Ports* puede variar entre versiones; se valida con un piloto
antes de automatizar (la versión instalada es TightVNC 2.8.87).

Procedimiento en **un PC con doble monitor**:
1. *TightVNC Server → Configuration → pestaña Server → Extra ports*: añadir un puerto por pantalla
   asociado a su número de pantalla (seguir el formato que indica la propia ayuda del campo).
   Aplicar y reiniciar el servicio (`net stop tvnserver` y `net start tvnserver`, como administrador).
2. Exportar la configuración resultante para fijar el formato real:
   ```powershell
   reg export "HKLM\SOFTWARE\TightVNC\Server" pilot.reg
   ```
3. Con TightVNC Viewer, conectar a `IP::5901` y `IP::5902`. Anotar qué monitor físico muestra cada uno.
   Si la numeración no coincide con lo esperado, probar la opción B (rectángulo) y registrarlo en un ADR.
4. Abrir **a la vez** ambas conexiones y comprobar que una no expulsa a la otra. Si lo hace,
   activar en el servidor la opción de compartir conexiones (valor de registro `AlwaysShared`
   o su equivalente en la interfaz) y repetir.
5. Abrir el puerto en el firewall del puesto de prueba (5901-5904) y repetir desde `docker1`.

Con el resultado, el agente genera (T-49) `extras/tightvnc-multimonitor/configurar-pantallas.ps1`:
idempotente, escribe la configuración de puertos en el registro, crea/actualiza la regla de
firewall (5900-5904 solo desde `docker1` y los PCs de los técnicos) y reinicia el servicio.
Despliegue masivo: GPO de inicio de sesión/arranque que ejecute ese script solo en equipos
`MULTI_PENDING`.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| La numeración de pantallas de TightVNC no coincide con la de Windows | Etiqueta editable por pantalla + piloto + opción B |
| Cambia la disposición de monitores (portátil con/sin base) | Opción A no depende de coordenadas; el descubrimiento deshabilita pantallas que dejan de responder |
| El servidor expulsa la conexión previa al abrir otra | Comprobación en el piloto (§7.4) |
| Popups bloqueados al abrir varias ventanas | Panel de respaldo con un botón por pantalla; aviso en la ayuda |
| `monitorCount` de OCS impreciso | Solo es una pista; manda el sondeo de puertos |
