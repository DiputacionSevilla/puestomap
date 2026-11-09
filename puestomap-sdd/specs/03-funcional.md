# 03 — Requisitos funcionales

Formato de criterios: **CUANDO** (evento) **SI** (condición) **EL SISTEMA DEBERÁ** (respuesta).

---

## RF-01 Autenticación
- CA-1: CUANDO un usuario envía usuario y contraseña válidos y está activo, EL SISTEMA DEBERÁ crear sesión (JWT httpOnly, 8 h) y redirigir al panel.
- CA-2: SI hay 5 intentos fallidos en 10 min, EL SISTEMA DEBERÁ bloquear la cuenta 15 min y registrar `auth.locked`.
- CA-3: Todas las rutas salvo `/login`, `/api/health` y `/api/auth/*` requieren sesión (middleware).
- CA-4: Un `VIEWER` no ve los botones de asistencia ni puede llamar a los endpoints de sesión (403).

## RF-02 Listado de equipos
- CA-1: Tabla paginada en servidor (50 por página) con columnas: estado (punto de color), hostname, IP, último usuario, asignado a, edificio / planta / despacho, departamento, SO, último sondeo, acciones.
- CA-2: Búsqueda de texto libre sobre hostname, IP, último usuario, asignado a, serial y notas (ILIKE).
- CA-3: Filtros combinables: edificio, planta, departamento, despacho, estado VNC (`READY`, `NOT_LISTENING`, `NOT_INSTALLED`, `OFFLINE`, `UNKNOWN`), "sin ubicar", "no visto en OCS > 30 días", SO, archivados (por defecto ocultos).
- CA-4: Los filtros se reflejan en la URL (query string) para poder compartir/recargar.
- CA-5: Ordenación por cualquier columna textual o fecha.
- CA-6: Acciones por fila: "Asistencia" (web), "TightVNC" (nativo), "Ver en plano" (si ubicado), "Ficha".
- CA-7: Exportar a CSV el resultado filtrado.

## RF-03 Ficha de equipo
- CA-1: Muestra todos los campos del modelo agrupados (Identidad, Red, Hardware/SO, Gestión, Ubicación, VNC, Estado en vivo) con origen del dato (OCS/Manual) y fecha de última sincronización.
- CA-2: Edición de Gestión, Ubicación (edificio → planta → despacho, departamento), credencial VNC, puerto VNC y `vncOverride`. Los campos de OCS se muestran de solo lectura.
- CA-3: Botón "Comprobar ahora" que lanza un sondeo inmediato del equipo y refresca el estado (≤ 5 s).
- CA-4: Mini-plano con la posición del equipo y enlace al mapa completo.
- CA-5: Historial de las últimas 20 sesiones remotas y de los cambios de auditoría del equipo.
- CA-6: Alta manual de equipo (hostname obligatorio y único) y archivado/restauración (solo ADMIN).

## RF-04 Mapa por planta
- CA-1: Selector edificio → planta. Se muestra el plano como imagen con zoom y desplazamiento (Leaflet `CRS.Simple`).
- CA-2: Cada equipo ubicado es un marcador circular con el color de su estado VNC y etiqueta con hostname visible a partir de cierto zoom; tooltip con último usuario e IP.
- CA-3: CUANDO se hace clic en un marcador, EL SISTEMA DEBERÁ abrir un panel lateral con resumen del equipo y botones "Asistencia", "TightVNC", "Ficha".
- CA-4: Buscador en el mapa: al elegir un equipo de otra planta, cambia de planta, centra y resalta (animación) el marcador.
- CA-5: **Modo edición** (TECH/ADMIN): los marcadores son arrastrables; al soltar se guarda la posición (`computer.move` en auditoría). Lista lateral de "equipos sin ubicar" filtrable, que se pueden arrastrar al plano para ubicarlos en la planta actual.
- CA-6: Al ubicar un equipo dentro del rectángulo de un despacho (si existe `rect`), se propone asignar ese despacho automáticamente.
- CA-7: Leyenda de colores y contadores por estado de la planta visible.
- CA-8: Parámetro `?focus=<computerId>` abre la planta del equipo y lo resalta (usado por "Ver en plano").
- CA-9: Estados actualizados sin recargar cada 60 s (polling ligero de `/api/floors/:id/computers`).

## RF-05 Gestión de estructura física
- CA-1: CRUD de edificios, plantas, departamentos y despachos (ADMIN; TECH solo despachos).
- CA-2: Subida de plano por planta: PNG, JPG, WebP o SVG, máx. 15 MB. Se guardan dimensiones. Reemplazar el plano conserva las posiciones normalizadas.
- CA-3: En una planta con plano, el ADMIN puede dibujar el rectángulo de un despacho (dos clics: esquina y esquina opuesta) — *opcional, ver tasks.md*.
- CA-4: No se puede borrar un edificio/planta/despacho con equipos asociados (mensaje explicativo).

## RF-06 Asistencia remota en navegador (WEB)
- CA-1: CUANDO un TECH/ADMIN pulsa "Asistencia", EL SISTEMA DEBERÁ abrir en pestaña nueva `/remote/<computerId>` que solicita la sesión y conecta noVNC al gateway.
- CA-2: Antes de conectar, diálogo opcional "Motivo / nº de incidencia" (se puede omitir; preferencia recordada en la sesión del navegador).
- CA-3: SI otro técnico tiene una sesión `ACTIVE` en ese equipo, EL SISTEMA DEBERÁ avisar ("Francisco está conectado desde las 10:42") y permitir continuar o cancelar.
- CA-4: Barra de herramientas: Ctrl+Alt+Supr, pantalla completa, ajustar a ventana / tamaño real, solo ver, enviar texto del portapapeles, desconectar. Indicador de estado (conectando, conectado, desconectado, error) y duración.
- CA-5: Errores comprensibles: equipo apagado/inaccesible, VNC no responde, contraseña VNC incorrecta, token caducado, destino no permitido.
- CA-6: Al cerrar la pestaña o desconectar, la sesión pasa a `ENDED` con motivo y bytes transferidos.

## RF-07 Asistencia con TightVNC Viewer (NATIVE)
- CA-1: Botón "TightVNC" registra la sesión en auditoría y abre `tightvnc://<ip>:<puerto>`.
- CA-2: Botón "Copiar contraseña VNC" junto al anterior (TECH/ADMIN), con aviso de 30 s y registro `credential.copy`.
- CA-3: Página `/ayuda/tightvnc` con instrucciones e enlace de descarga de los ficheros de `extras/tightvnc-protocol` (servidos desde `public/extras/`).
- CA-4: SI el equipo no tiene IP conocida, usar hostname.

## RF-08 Sincronización con OCS Inventory
- CA-1: El worker sincroniza según `OCS_SYNC_CRON` (def. cada 2 h) y bajo demanda desde Ajustes ("Sincronizar ahora").
- CA-2: Primera ejecución: completa. Siguientes: incremental con `computers/lastupdate` usando el tiempo desde la última sincronización correcta (+ margen 1 h).
- CA-3: Casación por `ocsId`; si no existe, por hostname normalizado (y entonces se guarda `ocsId`).
- CA-4: Respeta DM-2 (no pisa datos manuales). Registra `SyncRun` con estadísticas (creados, actualizados, sin cambios, errores).
- CA-5: Un error en un equipo no aborta la sincronización (estado `PARTIAL`).
- CA-6: Ajustes muestra las últimas 10 ejecuciones con duración y resultado.

## RF-09 Sondeo de conectividad y VNC
- CA-1: Cada `PROBE_INTERVAL_MIN` (def. 5) el worker sondea todos los equipos no archivados con IP o hostname, con concurrencia `PROBE_CONCURRENCY` y timeout `PROBE_TIMEOUT_MS`.
- CA-2: Para cada equipo: TCP al puerto VNC leyendo banner RFB (12 bytes). Si el banner coincide → `online=true`, `vncReachable=true`, `rfbVersion`. Si conexión rechazada → `online=true`, `vncReachable=false`. Si timeout → probar `PROBE_ONLINE_PORTS` (def. `445,135,3389`); si alguno conecta o rechaza → `online=true`, si no → `online=false`.
- CA-3: El sondeo **cierra la conexión tras leer el banner**, sin negociar seguridad (no genera intentos de autenticación en el servidor VNC).
- CA-4: Tras cada sondeo se recalcula `vncInstalled` (ver 02 §3).
- CA-5: Endpoint de sondeo inmediato por equipo (RF-03 CA-3) y por planta ("Comprobar planta").

## RF-10 Importación / exportación CSV
- CA-1: Importación (ADMIN) de equipos con columnas definidas en `05-integraciones.md` §6; previsualización con validación por fila antes de confirmar.
- CA-2: Casación por hostname; las columnas vacías no borran datos existentes.
- CA-3: Crea automáticamente edificio/planta/departamento/despacho referenciados por código si no existen (opción marcable, desmarcada por defecto).
- CA-4: Importación de estructura (edificios, plantas, departamentos, despachos) con su propio formato.
- CA-5: Exportación completa de equipos con el mismo formato (ida y vuelta).

## RF-11 Auditoría
- CA-1: Página `/auditoria` (ADMIN) con filtros por usuario, acción, equipo y fechas; exportación CSV.
- CA-2: Página `/sesiones` (TECH/ADMIN): sesiones remotas con duración, modo, motivo y resultado; sesiones activas destacadas.
- CA-3: El worker marca como `EXPIRED` las sesiones `PENDING` con más de 2 min y como `ENDED` (motivo `stale`) las `ACTIVE` sin cierre tras 4 h.

## RF-12 Panel de inicio (dashboard)
- CA-1: KPIs: total equipos, `READY`, `NOT_LISTENING`, `NOT_INSTALLED`, `OFFLINE/UNKNOWN`, sin ubicar, no vistos en OCS > 30 días. Cada KPI enlaza al listado filtrado.
- CA-2: Tabla resumen por edificio con los mismos contadores.
- CA-3: Últimas 10 sesiones remotas y estado de la última sincronización OCS y del último sondeo.
- CA-4: Buscador global destacado (hostname, IP, usuario) que lleva a la ficha o al plano.

## RF-13 Usuarios (ADMIN)
- CA-1: CRUD de usuarios, cambio de rol, activar/desactivar, reseteo de contraseña.
- CA-2: Cada usuario puede cambiar su propia contraseña (mín. 12 caracteres).

## RF-14 Credenciales VNC (ADMIN)
- CA-1: CRUD de credenciales con nombre y contraseña (máx. 8 caracteres: límite del protocolo VNC; avisar si es mayor, se trunca).
- CA-2: La contraseña nunca se muestra tras guardarla (solo "Reemplazar").
- CA-3: Asignación masiva de credencial a los equipos filtrados en el listado.

---

## RF-15 Equipos con varias pantallas
Diseño técnico en `09-multipantalla.md`.
- CA-1: La ficha tiene la pestaña "Pantallas": lista (etiqueta editable, puerto, origen, estado de sondeo), botón "Detectar pantallas" y alta manual.
- CA-2: El worker descubre pantallas automáticamente (equipos con `monitorCount > 1` o con pantallas ya conocidas; puertos 5901…5904) y mantiene su estado.
- CA-3: Un equipo con ≥ 2 pantallas habilitadas muestra el icono ▭▭ y su botón "Asistencia" es un botón dividido: "Todas las pantallas (ventanas)" (por defecto), "Todas (mosaico)", "Pantalla N…" y "Escritorio completo (unido)".
- CA-4: "Todas las pantallas (ventanas)" abre una ventana por pantalla con el mismo `groupId`; cada ventana crea su propia sesión (una fila de auditoría por pantalla). Si el navegador bloquea las ventanas, se muestra un panel con un botón por pantalla.
- CA-5: La barra del visor muestra `hostname · Pantalla N` y un botón "Desconectar todas" que cierra las sesiones del grupo.
- CA-6: El modo mosaico muestra todas las pantallas en una sola pestaña; el teclado se dirige a la pantalla enfocada.
- CA-7: El aviso `SESSION_IN_USE` solo se produce por sesiones activas de otros usuarios en cualquier puerto del equipo.
- CA-8: Filtro "Multipantalla pendiente de configurar" (`monitorCount > 1` y < 2 pantallas habilitadas) en el listado y KPI en el dashboard.
- CA-9: Modo nativo: un enlace `tightvnc://ip:puerto` por pantalla y otro para el escritorio completo.
