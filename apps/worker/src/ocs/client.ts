type FetchLike = typeof fetch;

export type OcsClient = {
  listComputerIds(secondsSince?: number): Promise<number[]>;
  getComputer(id: number): Promise<unknown>;
};

function idsFrom(value: unknown): number[] {
  const list = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object"
      ? Object.values(value as Record<string, unknown>)
      : [];
  return list
    .map((item) => {
      if (typeof item === "number" || typeof item === "string") return Number(item);
      if (item !== null && typeof item === "object") {
        const row = item as Record<string, unknown>;
        return Number(row.ID ?? row.id);
      }
      return Number.NaN;
    })
    .filter((id) => Number.isInteger(id) && id > 0);
}

export function createOcsClient(options: {
  baseUrl: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  retries?: number;
  fetchFn?: FetchLike;
}): OcsClient {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const retries = options.retries ?? 2;
  const authorization = options.username
    ? `Basic ${Buffer.from(`${options.username}:${options.password ?? ""}`).toString("base64")}`
    : undefined;

  async function request(path: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchFn(`${baseUrl}${path}`, {
          headers: authorization ? { Authorization: authorization } : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`OCS HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("OCS request failed");
  }

  return {
    async listComputerIds(secondsSince) {
      const data = await request(
        secondsSince === undefined
          ? "/computers/listID"
          : `/computers/lastupdate/${Math.max(0, Math.round(secondsSince))}`,
      );
      return idsFrom(data);
    },
    getComputer(id) {
      return request(`/computer/${id}`);
    },
  };
}
