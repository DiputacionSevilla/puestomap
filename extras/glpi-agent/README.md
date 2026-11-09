# Despliegue automático del GLPI Agent (GPO)

Sustituye a los agentes FusionInventory/OCS por el **GLPI Agent** y envía el inventario al
inventario nativo de GLPI (`/glpi/front/inventory.php`). Ver la decisión en la conversación del
CR-02 (GLPI como fuente de verdad).

## Requisitos previos

1. GLPI actualizado a la última 10.0.x y **inventario activado** (*Administración → Inventario →
   Activar inventario*).
2. MSI `x64` oficial del GLPI Agent (releases de `glpi-project/glpi-agent` en GitHub) copiado a un
   recurso de red con **lectura para «Equipos del dominio»**, p. ej. `\\<dominio>\NETLOGON\glpi-agent\`.
3. Los PCs resuelven y alcanzan `soporte.mairenadelalcor.net` por HTTPS (443) con certificado
   de confianza. Probarlo desde un PC real, no solo desde el de administración.

## Configurar el script

Editar la cabecera de `Install-GlpiAgent.ps1`: `$MsiPath`, `$Server` y, si procede, `$Tag`.
Copiar el script a `\\<dominio>\NETLOGON\glpi-agent\`.

## Crear la GPO

*Configuración del equipo → Directivas → Configuración de Windows → Scripts → **Inicio** → pestaña
Scripts*:

- Nombre del script: `powershell.exe`
- Parámetros: `-NoProfile -ExecutionPolicy Bypass -File "\\<dominio>\NETLOGON\glpi-agent\Install-GlpiAgent.ps1"`

Vincularla a la OU de equipos (o filtrar por grupo de seguridad). Se ejecuta en cada arranque como
SYSTEM y es idempotente: si el agente ya está en la versión del MSI no hace nada. Para actualizar
el agente en el futuro basta con sustituir el MSI en el recurso compartido.

## Plan recomendado

1. **Simulación**: `$DryRun = $true` y `$PilotComputers = @('PC1','PC2', ...)` (unos 5). Reiniciar
   esos PCs y leer `C:\ProgramData\GlpiAgentDeploy.log`.
2. **Piloto real**: `$DryRun = $false`. Comprobar en GLPI (*Administración → Agentes* y la ficha del
   equipo) que el equipo **se actualiza sin duplicarse** y que los datos están completos.
3. **Todos**: vaciar `$PilotComputers`. Los PCs lo aplican en su siguiente arranque.
4. Al terminar, desinstalar los plugins FusionInventory/OCS de GLPI.

## Notas

- Instala primero el agente nuevo y solo si tiene éxito desinstala los antiguos.
- Los parámetros `RUNNOW` y `TAG` del MSI deben confirmarse en la documentación del instalador de
  la versión que se despliegue; si alguno no existe, quitarlo de la lista de argumentos.
- El script no se ha podido probar contra un dominio real: **el piloto es obligatorio**.

## Despliegue remoto desde un CSV de escaneo (`Deploy-GlpiAgentRemote.ps1`)

Alternativa a la GPO para llegar rápido a la mayoría de equipos: se parte de un CSV con lo que ha
encontrado el escáner de IPs y se instala el agente en remoto.

**CSV de entrada** (separador tabulador, `;` o `,`, y UTF-16/UTF-8; se detecta solo; sirve la exportación de Advanced IP Scanner). Basta una columna de IP o de nombre; se
reconocen `ip/ipaddress/direccion/address`, `hostname/nombre/name/equipo` y, opcionalmente,
`os/sistema` (las filas que no sean Windows se omiten), `fabricante` (se omiten impresoras, NAS, routers y firewalls; ver `-ExcludeVendor`) y `estado` (se omiten los no activos). Un nombre igual a la IP se trata como «sin nombre». Las IPs repetidas se ignoran.

**Qué hace por equipo:** comprueba puertos 135/445 → se conecta por CIM/DCOM (sin WinRM) → verifica
que es un puesto Windows y que el nombre coincide con el CSV (si el DHCP ha cambiado de equipo, no
lo toca) → instala el MSI copiado por `ADMIN$` si falta o es más antiguo → **solo si el GLPI Agent
queda instalado**, desinstala FusionInventory Agent y OCS Inventory Agent → anota el resultado.

```powershell
# 1) Simulación (por defecto, solo lectura): dice qué haría en cada equipo
.\Deploy-GlpiAgentRemote.ps1 -CsvPath .\escaneo.csv -MsiPath .\GLPI-Agent-1.21-x64.msi

# 2) Piloto real con 5 equipos
.\Deploy-GlpiAgentRemote.ps1 -CsvPath .\escaneo.csv -MsiPath .\GLPI-Agent-1.21-x64.msi -Only PC01,PC02,PC03 -Execute

# 3) Tandas crecientes (pide escribir SI; -Force lo omite)
.\Deploy-GlpiAgentRemote.ps1 -CsvPath .\escaneo.csv -MsiPath .\GLPI-Agent-1.21-x64.msi -Limit 25 -Execute
```

Parámetros útiles: `-Credential (Get-Credential)` (cuenta con administrador local; no se guarda),
`-Only`, `-Limit`, `-Throttle` (equipos en paralelo, 8 por defecto), `-Tag`, `-SkipRemoveOld`,
`-TimeoutMinutes`. Es idempotente: repetirlo no reinstala donde ya está la versión del MSI.

**Resultados:** `deploy-results-<fecha>.csv` con estados `OK`, `OK_CON_AVISOS`, `SIMULACION`,
`NO_ALCANZABLE`, `NOMBRE_DISTINTO`, `OMITIDO`, `ERROR_INSTALACION`, `ERROR_VERIFICACION`, `ERROR`.
En cada equipo queda el log del MSI en `C:\Windows\Temp\glpi-agent-install.log`.

**Requisitos en los destinos:** cuenta de administrador local (p. ej. de dominio; con cuentas locales
hace falta `LocalAccountTokenFilterPolicy=1`), puertos 135/445 abiertos desde el PC que lanza el
script y la regla de firewall «Administración remota de Windows (DCOM/WMI)» y «Compartir archivos e
impresoras». Los equipos apagados saldrán `NO_ALCANZABLE`: repetir el script más tarde.

**Después:** comprobar en GLPI que aparece cada equipo con su inventario y sin duplicados
(`extras/glpi-upgrade/check_glpi.py`), y retirar del CSV los ya resueltos para la siguiente tanda.

> Los CSV de escaneo y de resultados contienen nombres e IPs internas: no se versionan (`.gitignore`).
