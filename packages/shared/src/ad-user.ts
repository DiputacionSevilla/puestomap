const DEFAULT_IGNORE = ["system"];

export function normalizeAdUser(
  raw: string | null | undefined,
  ignore: string[] = DEFAULT_IGNORE,
): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  const slash = value.lastIndexOf("\\");
  if (slash >= 0) value = value.slice(slash + 1);
  const at = value.indexOf("@");
  if (at >= 0) value = value.slice(0, at);
  value = value.trim();
  if (!value) return null;
  const ignored = ignore.map((i) => i.toLowerCase());
  if (ignored.includes(value)) return null;
  return value;
}

export type UserMatch = "UNASSIGNED" | "MATCH" | "MISMATCH" | "NO_OCS_USER";

export function deriveUserMatch(input: {
  adUsername?: string | null;
  lastUserNorm?: string | null;
}): UserMatch {
  if (!input.adUsername) return "UNASSIGNED";
  if (!input.lastUserNorm) return "NO_OCS_USER";
  return input.adUsername === input.lastUserNorm ? "MATCH" : "MISMATCH";
}
