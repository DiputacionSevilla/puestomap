const base = process.env.APP_URL ?? "http://localhost:3000";
const username = process.env.ADMIN_INITIAL_USER ?? "admin";
const password = process.env.ADMIN_INITIAL_PASSWORD ?? "";

if (!password) {
  console.error("[smoke] falta ADMIN_INITIAL_PASSWORD en el entorno");
  process.exit(1);
}

const cookies = new Map();
function storeCookies(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const line of set) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function cookieHeader() {
  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function fail(msg) {
  console.error(`[smoke] FALLA: ${msg}`);
  process.exitCode = 1;
}

async function main() {
  const health = await fetch(`${base}/api/health`);
  const healthBody = await health.json();
  if (health.status !== 200 || healthBody.db !== "ok") {
    fail(`health = ${health.status} ${JSON.stringify(healthBody)}`);
    return;
  }
  console.log("[smoke] health OK");

  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  storeCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const loginRes = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body: new URLSearchParams({ csrfToken, username, password }).toString(),
  });
  storeCookies(loginRes);
  if (loginRes.status !== 302 && loginRes.status !== 200) {
    fail(`login = ${loginRes.status}`);
    return;
  }

  const sessionRes = await fetch(`${base}/api/auth/session`, {
    headers: { Cookie: cookieHeader() },
  });
  const session = await sessionRes.json();
  if (!session?.user) {
    fail(`sin sesión tras login: ${JSON.stringify(session)}`);
    return;
  }
  console.log(`[smoke] login OK como ${session.user.name} (${session.user.role})`);

  for (const page of ["/", "/equipos", "/mapa", "/estructura", "/ajustes"]) {
    const res = await fetch(`${base}${page}`, {
      headers: { Cookie: cookieHeader() },
      redirect: "manual",
    });
    const ok = res.status === 200;
    if (!ok) fail(`${page} = ${res.status}`);
    else console.log(`[smoke] ${page} 200`);
  }

  const computers = await fetch(`${base}/api/computers?pageSize=5`, {
    headers: { Cookie: cookieHeader() },
  });
  const body = await computers.json();
  if (!Array.isArray(body.items)) fail(`/api/computers respuesta inesperada`);
  else console.log(`[smoke] /api/computers devuelve ${body.total} equipos`);

  const stats = await fetch(`${base}/api/stats`, { headers: { Cookie: cookieHeader() } });
  const statsBody = await stats.json();
  if (!statsBody?.kpis) fail("/api/stats sin kpis");
  else console.log(`[smoke] /api/stats OK (total=${statsBody.kpis.total})`);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
