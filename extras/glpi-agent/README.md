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
