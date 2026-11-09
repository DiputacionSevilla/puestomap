"""Foto de solo lectura de GLPI (versión y recuentos) para comparar antes/después de actualizar.

Uso:  python -I check_glpi.py <ruta/.env> [salida.json]
Lee GLPI_URL y GLPI_TOKEN (API token del usuario). No escribe nada en GLPI. No imprime secretos.
"""
import json
import sys
import urllib.error
import urllib.request

env = {}
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v.strip().strip('"')
base = env["GLPI_URL"].rstrip("/")
base = base if base.endswith("/glpi") else base + "/glpi"
api = base + "/apirest.php/"


def req(path, headers):
    r = urllib.request.Request(api + path, headers=headers)
    with urllib.request.urlopen(r, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
        return body, dict(resp.headers)


token = req("initSession", {"Authorization": "user_token " + env["GLPI_TOKEN"]})[0]["session_token"]
H = {"Session-Token": token}
out = {}
try:
    cfg = req("getGlpiConfig", H)[0].get("cfg_glpi", {})
    out["version"] = cfg.get("version")
    out["dbversion"] = (cfg.get("dbversion") or "")[:12]
    for item in ["Computer", "Ticket", "User", "Location", "Group", "Document", "Software",
                 "NetworkEquipment", "Printer", "Monitor", "Entity", "Agent",
                 "PluginFusioninventoryAgent"]:
        try:
            _, h = req(f"{item}?range=0-0", H)
            cr = h.get("Content-Range", "")
            out[item] = int(cr.split("/")[-1]) if "/" in cr else 0
        except urllib.error.HTTPError as e:
            out[item] = f"HTTP {e.code}"
    out["plugins"] = sorted(
        (p.get("directory"), p.get("version"), p.get("state"))
        for p in req("Plugin?range=0-100", H)[0]
    )
finally:
    try:
        req("killSession", H)
    except Exception:
        pass

print(json.dumps(out, ensure_ascii=False, indent=1))
if len(sys.argv) > 2:
    json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
