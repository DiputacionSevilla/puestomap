/** Solo se permiten rutas relativas internas tras el login (evita open redirect). */
export function safeCallbackPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return fallback;
  if (value.startsWith("/login")) return fallback;
  return value;
}

/** Enlace al ticket de GLPI a partir de un motivo tipo «#1234» (RF-22 CA-4). */
export function glpiTicketId(reason: string | null | undefined): number | null {
  const match = /^\s*#(\d{1,9})\b/.exec(reason ?? "");
  return match ? Number(match[1]) : null;
}
