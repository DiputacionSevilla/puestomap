import { normName } from "./keys.js";
import { normalizeAdUser } from "./ad-user.js";
import type { CsvRow, ImportIssue } from "./import-rules.js";

export type DirectoryUserInput = {
  username: string;
  displayName: string;
  givenName: string | null;
  surname: string | null;
  department: string | null;
  title: string | null;
  office: string | null;
  phone: string | null;
  searchName: string;
};

export type DirectoryRowResult = {
  line: number;
  action: "crear" | "actualizar" | "sin cambios" | "error";
  values: DirectoryUserInput | null;
  errors: ImportIssue[];
};

const value = (row: CsvRow, key: string) => (row[key] ?? "").trim() || null;

export function validateDirectoryImport(
  rows: CsvRow[],
  existing: DirectoryUserInput[],
): DirectoryRowResult[] {
  const byUsername = new Map(existing.map((user) => [user.username, user]));
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const errors: ImportIssue[] = [];
    const username = normalizeAdUser(value(row, "samaccountname"));
    const displayName = value(row, "displayname");
    if (!username) errors.push({ code: "USERNAME_VACIO", detail: "SamAccountName obligatorio" });
    if (!displayName) errors.push({ code: "NOMBRE_VACIO", detail: "DisplayName obligatorio" });
    if (username && seen.has(username)) {
      errors.push({ code: "USERNAME_DUPLICADO", detail: `${username} está repetido en el fichero` });
    }
    if (username) seen.add(username);
    if (!username || !displayName || errors.length > 0) {
      return { line: index + 2, action: "error" as const, values: null, errors };
    }
    const values: DirectoryUserInput = {
      username,
      displayName,
      givenName: value(row, "givenname"),
      surname: value(row, "surname"),
      department: value(row, "department"),
      title: value(row, "title"),
      office: value(row, "office"),
      phone: value(row, "telephonenumber"),
      searchName: normName(displayName),
    };
    const current = byUsername.get(username);
    const same = current && Object.entries(values).every(([key, next]) => current[key as keyof DirectoryUserInput] === next);
    return {
      line: index + 2,
      action: current ? (same ? "sin cambios" : "actualizar") : "crear",
      values,
      errors,
    };
  });
}
