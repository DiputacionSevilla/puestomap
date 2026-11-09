import { findOfficeAt, type Rect } from "./geo.js";
import { normalizeHostname } from "./hostname.js";
import type { CsvRow } from "./import-rules.js";

export type PositionComputer = { id: string; hostname: string; floorId: string | null };
export type PositionOffice = { id: string; code: string; floorId: string; rect: Rect | null };

export type PositionResult = {
  line: number;
  hostname: string;
  computerId: string | null;
  floorId: string | null;
  officeId: string | null;
  posX: number | null;
  posY: number | null;
  errors: { code: string; detail: string }[];
};

function coordinate(value: string | undefined): number | null {
  const text = (value ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return n >= 0 && n <= 1 ? n : null;
}

/**
 * RF-23: `hostname;pos_x;pos_y;despacho_codigo?`. Solo coloca equipos ya sincronizados desde GLPI;
 * nunca crea equipos ni cambia la planta que fijó GLPI. Idempotente.
 */
export function validatePositions(
  rows: CsvRow[],
  computers: PositionComputer[],
  offices: PositionOffice[],
): PositionResult[] {
  const byHost = new Map(computers.map((c) => [c.hostname, c]));
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const hostname = normalizeHostname(row.hostname ?? "").split(".")[0] ?? "";
    const result: PositionResult = {
      line: index + 2, hostname, computerId: null, floorId: null, officeId: null, posX: null, posY: null, errors: [],
    };
    const fail = (code: string, detail: string) => result.errors.push({ code, detail });
    if (!hostname) return (fail("HOSTNAME_VACIO", "Falta el hostname"), result);
    if (seen.has(hostname)) fail("HOSTNAME_DUPLICADO", "Hostname repetido en el fichero");
    seen.add(hostname);

    const computer = byHost.get(hostname);
    if (!computer) return (fail("EQUIPO_NO_SINCRONIZADO", "No existe en PuestoMap (¿está en GLPI?)"), result);
    result.computerId = computer.id;

    const posX = coordinate(row.pos_x);
    const posY = coordinate(row.pos_y);
    if (posX === null || posY === null) fail("POSICION_INVALIDA", "pos_x y pos_y deben estar entre 0 y 1");
    result.posX = posX;
    result.posY = posY;

    let floorId = computer.floorId;
    const code = (row.despacho_codigo ?? "").trim().toUpperCase();
    if (code) {
      const candidates = offices.filter((o) => o.code.toUpperCase() === code && (floorId ? o.floorId === floorId : true));
      if (candidates.length === 1) {
        result.officeId = candidates[0]!.id;
        floorId = floorId ?? candidates[0]!.floorId;
      } else {
        fail("DESPACHO_NO_ENCONTRADO", candidates.length === 0 ? `Despacho ${code} no existe en la planta` : `Despacho ${code} ambiguo`);
      }
    }
    if (!floorId) fail("SIN_PLANTA", "El equipo no tiene planta (GLPI no informa lugar); indica un despacho o ubícalo en el mapa");
    result.floorId = floorId;

    if (!result.officeId && floorId && posX !== null && posY !== null) {
      result.officeId = findOfficeAt(offices.filter((o) => o.floorId === floorId), posX, posY);
    }
    return result;
  });
}
