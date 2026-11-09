type FetchLike = typeof fetch;

export type GlpiErrorCode =
  | "AUTH_INVALID"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NON_JSON"
  | "UNAVAILABLE"
  | "BAD_CONFIG";

export class GlpiError extends Error {
  constructor(
    readonly code: GlpiErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GlpiError";
  }
}

export type GlpiResponse<T> = { data: T; headers: Headers; status: number };

export type GlpiApi = {
  get<T = unknown>(path: string): Promise<GlpiResponse<T>>;
  /** Lista paginada completa (lotes de 200 con `range`). */
  list(itemtype: string, params?: Record<string, string>): Promise<Record<string, unknown>[]>;
  put<T = unknown>(path: string, body: unknown): Promise<GlpiResponse<T>>;
};

export type GlpiClient = {
  /** Abre sesión, ejecuta `fn` y cierra SIEMPRE la sesión (también en error). */
  withSession<T>(fn: (api: GlpiApi) => Promise<T>): Promise<T>;
};

export type GlpiClientOptions = {
  baseUrl: string;
  userToken: string;
  appToken?: string;
  allowHttp?: boolean;
  timeoutMs?: number;
  retries?: number;
  pageSize?: number;
  fetchFn?: FetchLike;
};

function classify(status: number, body: unknown): GlpiError {
  const text = JSON.stringify(body ?? "").toUpperCase();
  if (status === 401 || text.includes("ERROR_GLPI_LOGIN") || text.includes("SESSION_TOKEN_INVALID")) {
    return new GlpiError("AUTH_INVALID", "GLPI rechazó las credenciales o la sesión ha caducado", status);
  }
  if (status === 403) return new GlpiError("FORBIDDEN", "La cuenta de GLPI no tiene permiso", status);
  if (status === 404) return new GlpiError("NOT_FOUND", "Recurso no encontrado en GLPI", status);
  return new GlpiError("UNAVAILABLE", `GLPI respondió HTTP ${status}`, status);
}

function isRangeExceeded(body: unknown): boolean {
  return Array.isArray(body) && body[0] === "ERROR_RANGE_EXCEED_TOTAL";
}

export function createGlpiClient(options: GlpiClientOptions): GlpiClient {
  const raw = options.baseUrl.trim().replace(/\/+$/, "");
  if (!raw) throw new GlpiError("BAD_CONFIG", "GLPI_URL no está configurada");
  if (!options.userToken) throw new GlpiError("BAD_CONFIG", "GLPI_TOKEN no está configurado");
  if (!raw.startsWith("https://") && !(options.allowHttp && raw.startsWith("http://"))) {
    throw new GlpiError("BAD_CONFIG", "GLPI_URL debe ser https:// (o activar GLPI_ALLOW_HTTP)");
  }
  const root = `${raw}/apirest.php`;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 2;
  const pageSize = options.pageSize ?? 200;

  async function request<T>(
    path: string,
    init: { method?: "GET" | "PUT"; headers?: Record<string, string>; body?: unknown },
  ): Promise<GlpiResponse<T>> {
    const method = init.method ?? "GET";
    let lastError: unknown;
    const attempts = method === "GET" ? retries : 0;
    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetchFn(`${root}/${path}`, {
          method,
          headers: {
            Accept: "application/json",
            ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(options.appToken ? { "App-Token": options.appToken } : {}),
            ...init.headers,
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const contentType = response.headers.get("content-type") ?? "";
        const text = await response.text();
        let data: unknown = null;
        if (text.length > 0) {
          try {
            data = JSON.parse(text);
          } catch {
            // Página HTML de un proxy/filtro DNS (p. ej. Fortinet) u otro error ajeno a GLPI.
            throw new GlpiError(
              "NON_JSON",
              `GLPI devolvió ${contentType || "contenido no JSON"} (HTTP ${response.status}): revisar DNS/proxy`,
              response.status,
            );
          }
        }
        if (!response.ok) {
          if (isRangeExceeded(data)) return { data: [] as unknown as T, headers: response.headers, status: 200 };
          throw classify(response.status, data);
        }
        return { data: data as T, headers: response.headers, status: response.status };
      } catch (error) {
        lastError = error instanceof GlpiError
          ? error
          : new GlpiError("UNAVAILABLE", "No se pudo conectar con GLPI");
        const retriable = lastError instanceof GlpiError && lastError.code === "UNAVAILABLE";
        if (!retriable || attempt >= attempts) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError;
  }

  return {
    async withSession(fn) {
      const init = await request<{ session_token?: string }>("initSession", {
        headers: { Authorization: `user_token ${options.userToken}` },
      });
      const token = init.data.session_token;
      if (!token) throw new GlpiError("AUTH_INVALID", "GLPI no devolvió session_token");
      const sessionHeaders = { "Session-Token": token };
      const api: GlpiApi = {
        get: (path) => request(path, { headers: sessionHeaders }),
        put: (path, body) => request(path, { method: "PUT", headers: sessionHeaders, body }),
        async list(itemtype, params = {}) {
          const items: Record<string, unknown>[] = [];
          for (let start = 0; ; start += pageSize) {
            const query = new URLSearchParams({ ...params, range: `${start}-${start + pageSize - 1}` });
            const page = await request<unknown>(`${itemtype}?${query.toString()}`, { headers: sessionHeaders });
            const rows = Array.isArray(page.data) ? (page.data as Record<string, unknown>[]) : [];
            items.push(...rows);
            const total = Number((page.headers.get("content-range") ?? "").split("/")[1]);
            if (rows.length < pageSize) break;
            if (Number.isFinite(total) && start + pageSize >= total) break;
          }
          return items;
        },
      };
      try {
        return await fn(api);
      } finally {
        try {
          await request("killSession", { headers: sessionHeaders });
        } catch {
          // la sesión caduca sola; no ocultar el resultado real
        }
      }
    },
  };
}

export function glpiClientFromEnv(env: Record<string, string | undefined> = process.env): GlpiClient {
  return createGlpiClient({
    baseUrl: env.GLPI_URL ?? "",
    userToken: env.GLPI_TOKEN ?? "",
    appToken: env.GLPI_APP_TOKEN || undefined,
    allowHttp: env.GLPI_ALLOW_HTTP === "true",
    timeoutMs: Number(env.GLPI_TIMEOUT_MS ?? 15_000) || 15_000,
  });
}
