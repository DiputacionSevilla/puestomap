import { cpSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

let novncRoot;
try {
  const entry = require.resolve("@novnc/novnc");
  novncRoot = path.dirname(path.dirname(entry));
} catch {
  console.log("[copy-novnc] @novnc/novnc no está instalado todavía; se omite.");
  process.exit(0);
}

if (!existsSync(path.join(novncRoot, "core", "rfb.js"))) {
  novncRoot = path.resolve(here, "..", "..", "..", "node_modules", "@novnc", "novnc");
}

const dest = path.resolve(here, "..", "public", "novnc");
rmSync(dest, { recursive: true, force: true });
mkdirSync(path.dirname(dest), { recursive: true });

const skip = new Set(["node_modules", ".git"]);
cpSync(novncRoot, dest, {
  recursive: true,
  filter: (src) => !skip.has(path.basename(src)),
});

if (!existsSync(path.join(dest, "core", "rfb.js"))) {
  console.error("[copy-novnc] no se encontró core/rfb.js en el paquete de noVNC.");
  process.exit(1);
}
console.log(`[copy-novnc] noVNC copiado a ${dest}`);

const extrasSrc = path.resolve(here, "..", "..", "puestomap-sdd", "extras", "tightvnc-protocol");
const extrasDest = path.resolve(here, "..", "public", "extras");
if (existsSync(extrasSrc)) {
  rmSync(extrasDest, { recursive: true, force: true });
  mkdirSync(extrasDest, { recursive: true });
  cpSync(extrasSrc, extrasDest, { recursive: true });
  console.log(`[copy-novnc] extras de tightvnc copiados a ${extrasDest}`);
}
