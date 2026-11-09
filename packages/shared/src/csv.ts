export const CSV_SEPARATOR = ";";
export const CSV_BOM = "\uFEFF";

export const COMPUTER_CSV_COLUMNS = [
  "hostname",
  "ip",
  "asignado_a",
  "extension",
  "edificio_codigo",
  "planta_nombre",
  "despacho_codigo",
  "departamento_codigo",
  "pos_x",
  "pos_y",
  "puerto_vnc",
  "credencial",
  "notas",
  "asset_tag",
] as const;

export type ComputerCsvColumn = (typeof COMPUTER_CSV_COLUMNS)[number];
export type ComputerCsvRow = Partial<Record<ComputerCsvColumn, string>>;

export const STRUCTURE_CSV_COLUMNS = [
  "tipo",
  "codigo",
  "nombre",
  "edificio_codigo",
  "planta_nombre",
  "nivel",
  "departamento_codigo",
] as const;

export type StructureCsvRow = Partial<Record<(typeof STRUCTURE_CSV_COLUMNS)[number], string>>;

export type KnownStructure = {
  buildings: { id: string; code: string }[];
  floors: { id: string; buildingId: string; name: string }[];
  offices: { id: string; floorId: string; code: string }[];
  departments: { id: string; code: string }[];
  credentials: { id: string; name: string }[];
};

export type ComputerCsvValues = {
  hostname: string;
  ip?: string;
  assignedTo?: string;
  phoneExt?: string;
  buildingCode?: string;
  floorName?: string;
  officeCode?: string;
  departmentCode?: string;
  posX?: number;
  posY?: number;
  vncPort?: number;
  credentialName?: string;
  notes?: string;
  assetTag?: string;
};

export type ComputerCsvRowResult = {
  line: number;
  errors: string[];
  values: ComputerCsvValues | null;
};

function clean(value: string | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

export function parseCoordinate(value: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 1) return null;
  return num;
}

export function validateComputerCsvRows(
  rows: ComputerCsvRow[],
  known: KnownStructure,
  opts: { createMissing: boolean },
): ComputerCsvRowResult[] {
  const buildingsByCode = new Map(known.buildings.map((b) => [b.code, b]));
  const floorsByKey = new Map(
    known.floors.map((f) => {
      const building = known.buildings.find((b) => b.id === f.buildingId);
      return [`${building?.code ?? ""}::${f.name}`.toUpperCase(), f] as const;
    }),
  );
  const officesByCode = new Map(known.offices.map((o) => [o.code, o]));
  const departmentsByCode = new Map(known.departments.map((d) => [d.code, d]));
  const credentialsByName = new Map(known.credentials.map((c) => [c.name, c]));

  return rows.map((row, i) => {
    const line = i + 2;
    const errors: string[] = [];

    const hostname = clean(row.hostname);
    if (!hostname) {
      return { line, errors: ["hostname obligatorio"], values: null };
    }

    const values: ComputerCsvValues = { hostname };

    const ip = clean(row.ip);
    if (ip !== undefined) values.ip = ip;

    const assignedTo = clean(row.asignado_a);
    if (assignedTo !== undefined) values.assignedTo = assignedTo;

    const phoneExt = clean(row.extension);
    if (phoneExt !== undefined) values.phoneExt = phoneExt;

    const notes = clean(row.notas);
    if (notes !== undefined) values.notes = notes;

    const assetTag = clean(row.asset_tag);
    if (assetTag !== undefined) values.assetTag = assetTag;

    const posXText = clean(row.pos_x);
    const posYText = clean(row.pos_y);
    let posX: number | null = null;
    let posY: number | null = null;
    if (posXText !== undefined) {
      posX = parseCoordinate(posXText);
      if (posX === null) errors.push(`pos_x fuera de rango 0..1: ${posXText}`);
    }
    if (posYText !== undefined) {
      posY = parseCoordinate(posYText);
      if (posY === null) errors.push(`pos_y fuera de rango 0..1: ${posYText}`);
    }
    if ((posXText !== undefined) !== (posYText !== undefined)) {
      errors.push("pos_x y pos_y deben informarse juntas");
    }

    const vncPortText = clean(row.puerto_vnc);
    if (vncPortText !== undefined) {
      const port = Number(vncPortText);
      if (!Number.isInteger(port) || port < 5900 || port > 5909) {
        errors.push(`puerto_vnc fuera de rango 5900-5909: ${vncPortText}`);
      } else {
        values.vncPort = port;
      }
    }

    const buildingCode = clean(row.edificio_codigo);
    const floorName = clean(row.planta_nombre);
    const officeCode = clean(row.despacho_codigo);
    const departmentCode = clean(row.departamento_codigo);
    const credentialName = clean(row.credencial);

    let floorId: string | undefined;
    if (buildingCode !== undefined || floorName !== undefined) {
      const building = buildingCode !== undefined ? buildingsByCode.get(buildingCode) : undefined;
      if (buildingCode !== undefined && !building && !opts.createMissing) {
        errors.push(`edificio desconocido: ${buildingCode}`);
      } else if (buildingCode !== undefined) {
        values.buildingCode = buildingCode;
      }
      if (floorName !== undefined) {
        values.floorName = floorName;
        const key = `${buildingCode ?? ""}::${floorName}`.toUpperCase();
        const floor = floorsByKey.get(key);
        if (floor) floorId = floor.id;
        else if (!opts.createMissing && buildingCode !== undefined) {
          errors.push(`planta desconocida: ${floorName} (edificio ${buildingCode})`);
        }
      }
    }

    if (officeCode !== undefined) {
      values.officeCode = officeCode;
      const office = officesByCode.get(officeCode);
      if (!office) {
        if (!opts.createMissing) errors.push(`despacho desconocido: ${officeCode}`);
      } else if (floorId !== undefined && office.floorId !== floorId) {
        errors.push(`el despacho ${officeCode} no pertenece a la planta indicada`);
      }
    }

    if (departmentCode !== undefined) {
      values.departmentCode = departmentCode;
      if (!departmentsByCode.has(departmentCode) && !opts.createMissing) {
        errors.push(`departamento desconocido: ${departmentCode}`);
      }
    }

    if (credentialName !== undefined) {
      values.credentialName = credentialName;
      if (!credentialsByName.has(credentialName)) {
        errors.push(`credencial desconocida: ${credentialName}`);
      }
    }

    if (posX !== null && posY !== null) {
      values.posX = posX;
      values.posY = posY;
    }

    return { line, errors, values: errors.length > 0 ? null : values };
  });
}

export function computersToCsv(
  rows: ComputerCsvRow[],
): string {
  const lines = [COMPUTER_CSV_COLUMNS.join(CSV_SEPARATOR)];
  for (const row of rows) {
    lines.push(
      COMPUTER_CSV_COLUMNS.map((col) => sanitizeCsvCell(row[col] ?? "")).join(CSV_SEPARATOR),
    );
  }
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

export function structureToCsv(rows: StructureCsvRow[]): string {
  const lines = [STRUCTURE_CSV_COLUMNS.join(CSV_SEPARATOR)];
  for (const row of rows) {
    lines.push(
      STRUCTURE_CSV_COLUMNS.map((col) => sanitizeCsvCell(row[col] ?? "")).join(CSV_SEPARATOR),
    );
  }
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

function sanitizeCsvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function normalizeCsvRows(
  headers: string[],
  rawRows: string[][],
): ComputerCsvRow[] {
  return rawRows.map((cells) => {
    const row: ComputerCsvRow = {};
    headers.forEach((header, i) => {
      const key = header.trim().toLowerCase() as ComputerCsvColumn;
      if ((COMPUTER_CSV_COLUMNS as readonly string[]).includes(key)) {
        row[key] = cells[i] ?? "";
      }
    });
    return row;
  });
}
