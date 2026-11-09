import { describe, expect, it, vi } from "vitest";
import { createGlpiClient, GlpiError } from "../src/glpi/client.js";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(body: unknown, init: ResponseInit & { range?: string } = {}): Response {
  const headers = new Headers({ "content-type": "application/json; charset=UTF-8" });
  if (init.range) headers.set("content-range", init.range);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

function client(handler: Handler, extra: Record<string, unknown> = {}) {
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init ?? {}));
  return {
    fetchFn,
    api: createGlpiClient({
      baseUrl: "https://glpi.example/glpi/",
      userToken: "tok",
      retries: 2,
      pageSize: 2,
      fetchFn: fetchFn as unknown as typeof fetch,
      ...extra,
    }),
  };
}

describe("cliente GLPI (T-U22)", () => {
  it("abre sesión con user_token, usa Session-Token y siempre hace killSession", async () => {
    const { api, fetchFn } = client((url, init) => {
      const headers = init.headers as Record<string, string>;
      if (url.endsWith("/initSession")) {
        expect(headers.Authorization).toBe("user_token tok");
        return json({ session_token: "S1" });
      }
      if (url.endsWith("/killSession")) return json(true);
      expect(headers["Session-Token"]).toBe("S1");
      return json({ ok: 1 });
    });
    const result = await api.withSession(async (a) => (await a.get<{ ok: number }>("getFullSession")).data);
    expect(result).toEqual({ ok: 1 });
    expect(fetchFn.mock.calls.at(-1)?.[0]).toContain("/apirest.php/killSession");
  });

  it("hace killSession aunque la función falle", async () => {
    const { api, fetchFn } = client((url) => (url.endsWith("/initSession") ? json({ session_token: "S1" }) : json(true)));
    await expect(api.withSession(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith("/killSession"))).toBe(true);
  });

  it("pagina con range y para al llegar al total (Content-Range)", async () => {
    const pages: string[] = [];
    const { api } = client((url) => {
      if (url.endsWith("/initSession")) return json({ session_token: "S" });
      if (url.endsWith("/killSession")) return json(true);
      pages.push(new URL(url).searchParams.get("range") ?? "");
      const start = Number((new URL(url).searchParams.get("range") ?? "0-1").split("-")[0]);
      const rows = [{ id: start + 1 }, { id: start + 2 }].slice(0, start + 2 > 5 ? 1 : 2);
      return json(rows, { status: 206, range: `${start}-${start + rows.length - 1}/5` });
    });
    const items = await api.withSession((a) => a.list("Computer", { is_deleted: "0" }));
    expect(items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
    expect(pages).toEqual(["0-1", "2-3", "4-5"]);
  });

  it("ERROR_RANGE_EXCEED_TOTAL (colección vacía) devuelve []", async () => {
    const { api } = client((url) => {
      if (url.endsWith("/initSession")) return json({ session_token: "S" });
      if (url.endsWith("/killSession")) return json(true);
      return json(["ERROR_RANGE_EXCEED_TOTAL", "x"], { status: 400 });
    });
    expect(await api.withSession((a) => a.list("Computer"))).toEqual([]);
  });

  it("reintenta solo los GET ante errores de servicio", async () => {
    let calls = 0;
    const { api } = client((url) => {
      if (url.endsWith("/initSession")) return json({ session_token: "S" });
      if (url.endsWith("/killSession")) return json(true);
      calls += 1;
      return calls < 3 ? json({}, { status: 503 }) : json({ ok: true });
    });
    const result = await api.withSession(async (a) => (await a.get<{ ok: boolean }>("x")).data);
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);

    let puts = 0;
    const { api: api2 } = client((url) => {
      if (url.endsWith("/initSession")) return json({ session_token: "S" });
      if (url.endsWith("/killSession")) return json(true);
      puts += 1;
      return json({}, { status: 503 });
    });
    await expect(api2.withSession((a) => a.put("Computer/1", { input: { locations_id: 3 } }))).rejects.toBeInstanceOf(GlpiError);
    expect(puts).toBe(1);
  });

  it("una página HTML (filtro DNS/proxy) produce NON_JSON con mensaje claro", async () => {
    const { api } = client(() => new Response("<html>Fortinet</html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(api.withSession(async () => 1)).rejects.toMatchObject({ code: "NON_JSON" });
  });

  it("clasifica credenciales inválidas y falta de permiso", async () => {
    const bad = client(() => json(["ERROR_GLPI_LOGIN_USER_TOKEN", "x"], { status: 401 }));
    await expect(bad.api.withSession(async () => 1)).rejects.toMatchObject({ code: "AUTH_INVALID" });
    const forbidden = client((url) => (url.endsWith("/initSession") ? json({ session_token: "S" }) : url.endsWith("/killSession") ? json(true) : json([], { status: 403 })));
    await expect(forbidden.api.withSession((a) => a.get("Computer"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exige HTTPS salvo GLPI_ALLOW_HTTP y token configurado", () => {
    expect(() => createGlpiClient({ baseUrl: "http://glpi/glpi", userToken: "t" })).toThrow(/https/);
    expect(() => createGlpiClient({ baseUrl: "http://glpi/glpi", userToken: "t", allowHttp: true })).not.toThrow();
    expect(() => createGlpiClient({ baseUrl: "https://glpi/glpi", userToken: "" })).toThrow(/GLPI_TOKEN/);
    expect(() => createGlpiClient({ baseUrl: "", userToken: "t" })).toThrow(/GLPI_URL/);
  });

  it("no filtra el token en los mensajes de error", async () => {
    const { api } = client(() => json({}, { status: 500 }));
    await api.withSession(async () => 1).catch((error: Error) => {
      expect(error.message).not.toContain("tok");
    });
  });
});
