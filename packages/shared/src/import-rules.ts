import { normKey } from "./keys.js";
import { normalizeAdUser } from "./ad-user.js";
import { findOfficeAt, rectsOverlap, type Rect } from "./geo.js";
import { sanitizeCsvCell } from "./csv.js";

export type CsvRow = Record<string, string>;

export type ImportIssue = { code: string; detail: string };

export type StructureRowResult = {
  line: number;
  tipo: string;
  action: "crear" | "actualizar" | "sin cambios" | "error";
  values: {
    tipo: "EDIFICIO" | "PLANTA" | "DEPARTAMENTO" | "DESPACHO";
    codigo?: string;
    nombre?: string;
    edificioCodigo?: string;
    plantaNombre?: string;
    nivel?: number;
    departamentoCodigo?: string;
    rect?: Rect;
  };
  errors: ImportIssue[];
  warnings: ImportIssue[];
  original: CsvRow;
};

export type ComputerRowResult = {
  line: number;
  action: "crear" | "actualizar" | "sin cambios" | "error";
  values: {
    hostname: string;
    ip?: string;
    assignedTo?: string;
    phoneExt?: string;
    notes?: string;
    assetTag?: string;
    adUsername?: string;
    floorId?: string;
    officeId?: string;
    departmentId?: string;
    posX?: number;
    posY?: number;
    vncPort?: number;
    credentialName?: string;
  };
  errors: ImportIssue[];
  warnings: ImportIssue[];
  original: CsvRow;
};

export function parseCsvTable(text: string): { headers: string[]; rows: CsvRow[] } {
  const cleaned = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ";") {
      record.push(field);
      field = "";
    } else if (ch === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => normalizeHeader(h));
  const rows: CsvRow[] = [];
  for (const cells of nonEmpty.slice(1)) {
    const row: CsvRow = {};
    headers.forEach((header, i) => {
      if (header) row[header] = (cells[i] ?? "").trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

const HEADER_ALIASES: Record<string, string> = {
  usuario: "usuario_dominio",
  "usuario de dominio": "usuario_dominio",
};

export function normalizeHeader(header: string): string {
  const base = header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return HEADER_ALIASES[base] ?? base;
}

function parseDec(value: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const RECT_TOL = 0.0005;

export function parseRect(row: CsvRow): { rect?: Rect; errors: ImportIssue[] } {
  const xs = row["rect_x"];
  const ys = row["rect_y"];
  const ws = row["rect_w"];
  const hs = row["rect_h"];
  const present = [xs, ys, ws, hs].filter((v) => v !== undefined && v !== "");
  if (present.length === 0) return { errors: [] };
  if (present.length !== 4) {
    return { errors: [{ code: "RECT_INVALIDO", detail: "rect_x, rect_y, rect_w y rect_h deben ir juntos" }] };
  }
  const x = parseDec(xs);
  const y = parseDec(ys);
  const w = parseDec(ws);
  const h = parseDec(hs);
  if (x === null || y === null || w === null || h === null) {
    return { errors: [{ code: "RECT_INVALIDO", detail: "valores de rect no numéricos" }] };
  }
  const bad =
    x < -RECT_TOL ||
    y < -RECT_TOL ||
    w <= 0 ||
    h <= 0 ||
    x + w > 1 + RECT_TOL ||
    y + h > 1 + RECT_TOL;
  if (bad) {
    return { errors: [{ code: "RECT_INVALIDO", detail: `rect fuera de rango 0..1 (${x},${y},${w},${h})` }] };
  }
  return { rect: { x, y, w, h }, errors: [] };
}

export type KnownBuilding = {
  id: string;
  code: string;
  name: string;
  floors: {
    id: string;
    name: string;
    planFile: string | null;
    offices: { id: string; code: string; name: string; departmentId: string | null; rect: Rect | null }[];
  }[];
};

export type StructureCtx = {
  buildings: KnownBuilding[];
  departments: { id: string; code: string; name?: string }[];
};

export function validateStructureImport(
  rows: CsvRow[],
  ctx: StructureCtx,
): StructureRowResult[] {
  const results: StructureRowResult[] = [];
  const seenRectsByFloor = new Map<string, Rect[]>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const tipoRaw = (row["tipo"] ?? "").trim();
    const tipo = normKey(tipoRaw).toUpperCase();

    if (!["EDIFICIO", "PLANTA", "DEPARTAMENTO", "DESPACHO"].includes(tipo)) {
      errors.push({ code: "TIPO_INVALIDO", detail: `tipo desconocido: ${tipoRaw}` });
    }

    const codigo = (row["codigo"] ?? "").trim();
    const nombre = (row["nombre"] ?? "").trim();
    const edificioCodigo = (row["edificio_codigo"] ?? "").trim();
    const plantaNombre = (row["planta_nombre"] ?? "").trim();
    const departamentoCodigo = (row["departamento_codigo"] ?? "").trim();
    const nivelRaw = (row["nivel"] ?? "").trim();
    const nivel = nivelRaw ? Number(nivelRaw) : 0;

    if (tipo !== "PLANTA" && !codigo) {
      errors.push({ code: "CODIGO_VACIO", detail: "codigo obligatorio" });
    }
    if (!nombre) {
      errors.push({ code: "NOMBRE_VACIO", detail: "nombre obligatorio" });
    }
    if ((tipo === "PLANTA" || tipo === "DESPACHO") && !edificioCodigo) {
      errors.push({ code: "EDIFICIO_VACIO", detail: `${tipo} requiere edificio_codigo` });
    }
    if (tipo === "PLANTA" && !plantaNombre) {
      errors.push({ code: "PLANTA_VACIA", detail: "PLANTA requiere planta_nombre" });
    }
    if (tipo === "DESPACHO" && !plantaNombre) {
      errors.push({ code: "PLANTA_VACIA", detail: "DESPACHO requiere planta_nombre" });
    }

    const building = ctx.buildings.find(
      (b) => normKey(b.code) === normKey(edificioCodigo),
    );

    let action: StructureRowResult["action"] = "crear";
    const values: StructureRowResult["values"] = {
      tipo: tipo as StructureRowResult["values"]["tipo"],
    };

    if (tipo === "EDIFICIO") {
      values.codigo = codigo;
      values.nombre = nombre;
      const existing = ctx.buildings.find((b) => normKey(b.code) === normKey(codigo));
      action = existing ? (existing.name === nombre ? "sin cambios" : "actualizar") : "crear";
    } else if (tipo === "DEPARTAMENTO") {
      values.codigo = codigo;
      values.nombre = nombre;
      const existing = ctx.departments.find((d) => normKey(d.code) === normKey(codigo));
      action = existing ? (existing.name === undefined || existing.name === nombre ? "sin cambios" : "actualizar") : "crear";
    } else if (tipo === "PLANTA") {
      values.nombre = plantaNombre;
      values.edificioCodigo = edificioCodigo;
      values.nivel = Number.isFinite(nivel) ? nivel : 0;
      if (edificioCodigo && !building) {
        action = "crear";
      } else if (building) {
        const floor = building.floors.find((f) => normKey(f.name) === normKey(plantaNombre));
        if (floor) action = "sin cambios";
      }
    } else if (tipo === "DESPACHO") {
      values.codigo = codigo;
      values.nombre = nombre;
      values.edificioCodigo = edificioCodigo;
      values.plantaNombre = plantaNombre;
      if (departamentoCodigo) values.departamentoCodigo = departamentoCodigo;
      const rectResult = parseRect(row);
      errors.push(...rectResult.errors);
      if (rectResult.rect) {
        values.rect = rectResult.rect;
        const floorKey = `${normKey(edificioCodigo)}::${normKey(plantaNombre)}`;
        const seen = seenRectsByFloor.get(floorKey) ?? [];
        if (seen.some((r) => rectsOverlap(r, rectResult.rect as Rect))) {
          warnings.push({ code: "RECT_SOLAPADO", detail: "el rectángulo se solapa con otro despacho de la fila" });
        }
        seen.push(rectResult.rect);
        seenRectsByFloor.set(floorKey, seen);
      }
      const floor = building?.floors.find((f) => normKey(f.name) === normKey(plantaNombre));
      const office = floor?.offices.find((o) => normKey(o.code) === normKey(codigo));
      if (floor && office) {
        const rectSame =
          JSON.stringify(office.rect ?? null) === JSON.stringify(values.rect ?? null);
        action = rectSame && office.name === nombre ? "sin cambios" : "actualizar";
      } else if (floor) {
        action = "crear";
      }
    }

    results.push({
      line,
      tipo,
      action: errors.length > 0 ? "error" : action,
      values,
      errors,
      warnings,
      original: row,
    });
  }

  return results;
}

export type ExistingComputer = {
  id: string;
  hostname: string;
  ip: string | null;
  ocsId: number | null;
  assignedTo: string | null;
  adUsername: string | null;
  floorId: string | null;
  officeId: string | null;
  departmentId: string | null;
  posX: number | null;
  posY: number | null;
  vncPort: number;
  notes: string | null;
  assetTag: string | null;
  phoneExt: string | null;
};

export type ComputerImportCtx = {
  buildings: KnownBuilding[];
  departments: { id: string; code: string }[];
  credentials: { id: string; name: string }[];
  computers: ExistingComputer[];
  directoryUsernames: Set<string>;
  directoryEmpty: boolean;
  adUsers: Map<string, string>;
};

const IGNORE_LASTUSER = ["system"];

export function validateComputerImport(
  rows: CsvRow[],
  ctx: ComputerImportCtx,
  opts: { crearEquipos: boolean; lastUserIgnore?: string[] },
): ComputerRowResult[] {
  const results: ComputerRowResult[] = [];
  const seenHostnames = new Set<string>();
  const placed: { floorId: string; x: number; y: number }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];

    const hostnameRaw = (row["hostname"] ?? "").trim();
    if (!hostnameRaw) {
      results.push({
        line,
        action: "crear",
        values: { hostname: "" },
        errors: [{ code: "HOSTNAME_VACIO", detail: "hostname obligatorio" }],
        warnings,
        original: row,
      });
      continue;
    }
    const hostname = hostnameRaw.trim().toUpperCase();
    if (seenHostnames.has(hostname)) {
      errors.push({ code: "HOSTNAME_DUPLICADO", detail: `hostname repetido en el fichero: ${hostname}` });
    }
    seenHostnames.add(hostname);

    const values: ComputerRowResult["values"] = { hostname };
    const existing = ctx.computers.find((c) => c.hostname === hostname);
    let dirty = existing === undefined;

    if (!existing && !opts.crearEquipos) {
      errors.push({ code: "EQUIPO_DESCONOCIDO", detail: `hostname desconocido y creación desactivada: ${hostname}` });
    }

    const ip = (row["ip"] ?? "").trim();
    if (ip) {
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        errors.push({ code: "IP_INVALIDA", detail: `IP no válida: ${ip}` });
      } else if (existing && existing.ocsId !== null && existing.ip !== null) {
        warnings.push({ code: "IP_GESTIONADA_POR_OCS", detail: "la IP se omite porque la gestiona OCS" });
      } else {
        values.ip = ip;
        if (existing && existing.ip !== ip) dirty = true;
      }
    }

    const usuarioDominio = row["usuario_dominio"] ?? "";
    const adUsername = normalizeAdUser(usuarioDominio, opts.lastUserIgnore ?? IGNORE_LASTUSER);
    if (usuarioDominio.trim() && adUsername) {
      values.adUsername = adUsername;
      if (existing && existing.adUsername !== adUsername) dirty = true;
      if (!ctx.directoryEmpty && !ctx.directoryUsernames.has(adUsername)) {
        warnings.push({ code: "USUARIO_FUERA_DIRECTORIO", detail: `el usuario ${adUsername} no está en el directorio` });
      }
    }

    const asignadoA = (row["asignado_a"] ?? "").trim();
    if (asignadoA) {
      values.assignedTo = asignadoA;
      if (existing && existing.assignedTo !== asignadoA) dirty = true;
    } else if (
      adUsername &&
      ctx.adUsers.has(adUsername) &&
      (!existing || !existing.assignedTo) &&
      (row["asignado_a"] ?? "").trim() === ""
    ) {
      values.assignedTo = ctx.adUsers.get(adUsername) as string;
      dirty = true;
    }

    const extension = (row["extension"] ?? "").trim();
    if (extension) {
      values.phoneExt = extension;
      if (existing && existing.phoneExt !== extension) dirty = true;
    }
    const notas = (row["notas"] ?? "").trim();
    if (notas) {
      values.notes = notas;
      if (existing && existing.notes !== notas) dirty = true;
    }
    const assetTag = (row["asset_tag"] ?? "").trim();
    if (assetTag) {
      values.assetTag = assetTag;
      if (existing && existing.assetTag !== assetTag) dirty = true;
    }

    const edificioCodigo = (row["edificio_codigo"] ?? "").trim();
    const plantaNombre = (row["planta_nombre"] ?? "").trim();
    const despachoCodigo = (row["despacho_codigo"] ?? "").trim();
    const departamentoCodigo = (row["departamento_codigo"] ?? "").trim();

    let floorId: string | undefined;
    let officeId: string | undefined;

    const building = edificioCodigo
      ? ctx.buildings.find((b) => normKey(b.code) === normKey(edificioCodigo))
      : ctx.buildings.find((b) =>
          b.floors.some((f) => f.offices.some((o) => normKey(o.code) === normKey(despachoCodigo))),
        );

    if (plantaNombre && building) {
      const floor = building.floors.find((f) => normKey(f.name) === normKey(plantaNombre));
      if (floor) {
        floorId = floor.id;
      } else {
        errors.push({ code: "PLANTA_NO_ENCONTRADA", detail: `planta desconocida: ${plantaNombre}` });
      }
    }

    if (despachoCodigo) {
      let office;
      if (floorId) {
        const floor = building?.floors.find((f) => f.id === floorId);
        office = floor?.offices.find((o) => normKey(o.code) === normKey(despachoCodigo));
        const otherFloor = building?.floors.find((f) =>
          f.id !== floorId && f.offices.some((o) => normKey(o.code) === normKey(despachoCodigo)),
        );
        if (!office && otherFloor) {
          errors.push({ code: "DESPACHO_OTRA_PLANTA", detail: `el despacho ${despachoCodigo} pertenece a otra planta` });
        }
      } else {
        const floorsWithOffice = building?.floors.filter((f) =>
          f.offices.some((o) => normKey(o.code) === normKey(despachoCodigo)),
        ) ?? [];
        if (floorsWithOffice.length === 1) {
          floorId = floorsWithOffice[0].id;
          office = floorsWithOffice[0].offices.find((o) => normKey(o.code) === normKey(despachoCodigo));
        }
      }
      if (office) {
        officeId = office.id;
        values.officeId = officeId;
        if (floorId) values.floorId = floorId;
        if (existing && existing.officeId !== officeId) dirty = true;
      } else if (!errors.some((e) => e.code === "DESPACHO_OTRA_PLANTA")) {
        errors.push({ code: "DESPACHO_NO_ENCONTRADO", detail: `despacho desconocido: ${despachoCodigo}` });
      }
    } else if (floorId) {
      values.floorId = floorId;
      if (existing && existing.floorId !== floorId) dirty = true;
    }

    if (departamentoCodigo) {
      const department = ctx.departments.find((d) => normKey(d.code) === normKey(departamentoCodigo));
      if (department) {
        values.departmentId = department.id;
        if (existing && existing.departmentId !== department.id) dirty = true;
      } else {
        errors.push({ code: "DEPARTAMENTO_NO_ENCONTRADO", detail: `departamento desconocido: ${departamentoCodigo}` });
      }
    }

    const posXRaw = (row["pos_x"] ?? "").trim();
    const posYRaw = (row["pos_y"] ?? "").trim();
    if ((posXRaw && !posYRaw) || (!posXRaw && posYRaw)) {
      errors.push({ code: "POSICION_INVALIDA", detail: "pos_x y pos_y deben ir juntas" });
    } else if (posXRaw && posYRaw) {
      const posX = parseDec(posXRaw);
      const posY = parseDec(posYRaw);
      if (posX === null || posY === null || posX > 1 || posY > 1) {
        errors.push({ code: "POSICION_INVALIDA", detail: `posición fuera de rango 0..1 (${posXRaw},${posYRaw})` });
      } else if (!floorId) {
        errors.push({ code: "POSICION_INVALIDA", detail: "la posición requiere planta" });
      } else {
        values.posX = posX;
        values.posY = posY;
        if (existing && (existing.posX !== posX || existing.posY !== posY)) dirty = true;

        const buildingFloors = building?.floors.find((f) => f.id === floorId);
        if (buildingFloors && !buildingFloors.planFile) {
          warnings.push({ code: "PLANTA_SIN_PLANO", detail: "la planta no tiene plano asignado" });
        }
        if (
          placed.some(
            (p) => p.floorId === floorId && Math.abs(p.x - posX) < 0.015 && Math.abs(p.y - posY) < 0.015,
          )
        ) {
          warnings.push({ code: "POSICION_SOLAPADA", detail: "otro equipo está a menos de 0,015 de esta posición" });
        }
        placed.push({ floorId, x: posX, y: posY });

        const floors = building?.floors.find((f) => f.id === floorId);
        if (!despachoCodigo && floors) {
          const inferred = findOfficeAt(
            floors.offices.map((o) => ({ id: o.id, rect: o.rect })),
            posX,
            posY,
          );
          if (inferred) {
            officeId = inferred;
            values.officeId = inferred;
            warnings.push({ code: "DESPACHO_INFERIDO", detail: "se asigna el despacho que contiene la posición" });
            dirty = true;
          }
        }
        const office = floors?.offices.find((o) => o.id === officeId);
        if (office?.rect) {
          const inside =
            posX >= office.rect.x &&
            posX <= office.rect.x + office.rect.w &&
            posY >= office.rect.y &&
            posY <= office.rect.y + office.rect.h;
          if (!inside) {
            warnings.push({ code: "FUERA_DEL_DESPACHO", detail: "la posición queda fuera del rectángulo del despacho" });
          }
        }
      }
    }

    const puertoVnc = (row["puerto_vnc"] ?? "").trim();
    if (puertoVnc) {
      const port = Number(puertoVnc);
      if (!Number.isInteger(port) || port < 5900 || port > 5909) {
        errors.push({ code: "PUERTO_INVALIDO", detail: `puerto_vnc fuera de rango: ${puertoVnc}` });
      } else {
        values.vncPort = port;
        if (existing && existing.vncPort !== port) dirty = true;
      }
    }

    const credencial = (row["credencial"] ?? "").trim();
    if (credencial) {
      const credential = ctx.credentials.find((c) => normKey(c.name) === normKey(credencial));
      if (credential) {
        values.credentialName = credential.name;
      } else {
        errors.push({ code: "CREDENCIAL_NO_ENCONTRADA", detail: `credencial desconocida: ${credencial}` });
      }
    }

    const action: ComputerRowResult["action"] =
      errors.length > 0
        ? "error"
        : existing === undefined
          ? "crear"
          : dirty
            ? "actualizar"
            : "sin cambios";

    results.push({ line, action, values, errors, warnings, original: row });
  }

  return results;
}

export function computerErrorsCsv(results: ComputerRowResult[]): string {
  const allColumns = new Set<string>();
  for (const r of results) {
    for (const key of Object.keys(r.original)) allColumns.add(key);
  }
  const columns = ["linea", "codigo_error", "detalle", ...Array.from(allColumns)];
  const lines = [columns.join(";")];
  for (const r of results) {
    for (const err of r.errors) {
      lines.push(
        [
          String(r.line),
          err.code,
          err.detail,
          ...Array.from(allColumns).map((c) => r.original[c] ?? ""),
        ]
          .map(sanitizeCsvCell)
          .join(";"),
      );
    }
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
