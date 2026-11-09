import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const base = process.env.E2E_BASE ?? "http://localhost:3000";
const user = process.env.E2E_ADMIN_USER ?? "admin";
const pw = process.env.E2E_ADMIN_PASSWORD;
if (!pw) {
  console.error("Falta E2E_ADMIN_PASSWORD (no se admiten contraseñas en el repositorio).");
  process.exit(2);
}
const hostname = process.env.E2E_HOSTNAME ?? "E2E-BROWSER-1";
const ip = process.env.E2E_COMPUTER_IP ?? "127.0.0.1";
const port = Number(process.env.E2E_VNC_PORT ?? 5905);
const bind = process.env.E2E_RFB_BIND ?? "0.0.0.0";
const checkComputerId = process.env.E2E_CHECK_COMPUTER_ID;

const cookies = new Map();
function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookieHeader = () =>
  Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

function fakeRfb() {
  return net.createServer((socket) => {
    let stage = 0;
    socket.write("RFB 003.008\n");
    socket.on("data", () => {
      if (stage === 0) {
        socket.write(Buffer.from([1, 1]));
        stage = 1;
      } else if (stage === 1) {
        socket.write(Buffer.from([0, 0, 0, 0]));
        stage = 2;
      } else if (stage === 2) {
        const init = Buffer.alloc(24);
        init.writeUInt16BE(640, 0);
        init.writeUInt16BE(480, 2);
        init.writeUInt8(32, 4);
        init.writeUInt8(24, 5);
        init.writeUInt8(1, 6);
        init.writeUInt8(1, 7);
        init.writeUInt16BE(255, 8);
        init.writeUInt16BE(255, 10);
        init.writeUInt16BE(255, 12);
        init.writeUInt8(16, 14);
        init.writeUInt8(8, 15);
        init.writeUInt8(0, 16);
        const name = Buffer.from("E2E", "utf8");
        const len = Buffer.alloc(4);
        len.writeUInt32BE(name.length, 0);
        socket.write(Buffer.concat([init, len, name]));
        stage = 3;
      }
    });
  });
}

async function main() {
  const fake = fakeRfb();
  await new Promise((r) => fake.listen(port, bind, r));

  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  storeCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const login = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken, username: user, password: pw }).toString(),
  });
  storeCookies(login);
  if (!cookies.has("authjs.session-token") && !cookies.has("__Secure-authjs.session-token")) {
    throw new Error("Login fallido: no hay cookie de sesión.");
  }
  console.log(`login OK en ${base}`);

  if (checkComputerId) {
    const res = await fetch(`${base}/api/computers/${checkComputerId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
      body: JSON.stringify({ mode: "WEB" }),
    });
    const body = await res.json();
    console.log(`sesión equipo ${checkComputerId}:`, res.status, res.status === 200 ? "OK" : JSON.stringify(body));
    if (res.status !== 200) throw new Error("POST sessions falló (¿imagen web desactualizada?).");
  }

  let computerId;
  const existing = await fetch(
    `${base}/api/computers?q=${encodeURIComponent(hostname)}&archived=true&pageSize=5`,
    { headers: { Cookie: cookieHeader() } },
  ).then((r) => r.json());
  const found = (existing.items ?? []).find((c) => c.hostname === hostname);
  if (found) {
    computerId = found.id;
    await fetch(`${base}/api/computers/${computerId}/restore`, {
      method: "POST",
      headers: { Cookie: cookieHeader() },
    });
    await fetch(`${base}/api/computers/${computerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
      body: JSON.stringify({ ip, vncPort: port }),
    });
  } else {
    const create = await fetch(`${base}/api/computers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
      body: JSON.stringify({ hostname, ip, vncPort: port }),
    }).then((r) => r.json());
    computerId = create.id;
  }
  if (!computerId) throw new Error("No se pudo crear/obtener el equipo de prueba.");
  console.log("equipo:", computerId);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));

    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="username"]', user);
    await page.fill('input[name="password"]', pw);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const native = await page.evaluate(
      async (id) => {
        const response = await fetch(`/api/computers/${id}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "NATIVE" }),
        });
        return { status: response.status, body: await response.json() };
      },
      computerId,
    );
    const expected = `tightvnc://${ip}:${port}`;
    console.log("URL nativa:", native.status, native.body.url);
    if (native.status !== 200 || native.body.url !== expected) {
      throw new Error(`URL nativa incorrecta (esperada ${expected}): ${JSON.stringify(native)}`);
    }

    await page.goto(`${base}/remote/${computerId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const btn = page.locator('button:text-is("Conectar")').first();
    if (await btn.count()) {
      await btn.click();
      console.log("botón Conectar pulsado");
    }
    await page.waitForTimeout(8000);
    const text = await page.locator("body").innerText();
    console.log("=== PÁGINA REMOTA ===");
    console.log(text.slice(0, 600));
    await page.screenshot({
      path: path.join(os.tmpdir(), "puestomap-remote-test.png"),
    });
    if (!text.includes("conectado")) {
      throw new Error("El visor no alcanzó el estado «conectado».");
    }
    console.log("RESULTADO: OK — visor conectado");
  } finally {
    await browser.close();
    fake.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("FALLO:", err.message);
  process.exit(1);
});
