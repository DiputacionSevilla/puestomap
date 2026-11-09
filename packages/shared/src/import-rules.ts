export type CsvRow = Record<string, string>;

export type ImportIssue = { code: string; detail: string };

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
