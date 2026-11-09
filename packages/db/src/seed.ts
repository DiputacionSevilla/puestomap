import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeHostname, normalizeAdUser } from "@puestomap/shared";
import { encryptSecret } from "@puestomap/shared/crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { backfillLastUserNorm } from "./backfill.js";

const prisma = new PrismaClient();

const SEED_VNC_PASSWORD = "seed-vnc-1";
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads");
const ADMIN_USER = process.env.ADMIN_INITIAL_USER ?? "admin";

function planSvg(title: string, width: number, height: number, rooms: { code: string; x: number; y: number; w: number; h: number }[]): string {
  const roomRects = rooms
    .map(
      (r) =>
        `  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#eef2ff" stroke="#4f46e5" stroke-width="2"/>\n` +
        `  <text x="${r.x + 8}" y="${r.y + 22}" font-family="sans-serif" font-size="14" fill="#3730a3">${r.code}</text>`,
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f8fafc"/>
  <text x="24" y="36" font-family="sans-serif" font-size="22" fill="#0f172a">${title}</text>
  <rect x="12" y="52" width="${width - 24}" height="${height - 70}" fill="none" stroke="#0f172a" stroke-width="4"/>
${roomRects}
</svg>
`;
}

async function seedStructure() {
  const buildings = await Promise.all([
    prisma.building.upsert({
      where: { code: "CASA-CONSIST" },
      update: {},
      create: {
        id: "seed-b-casa",
        code: "CASA-CONSIST",
        name: "Casa Consistorial",
        address: "Plaza de la Constitución, 1",
        sortOrder: 1,
      },
    }),
    prisma.building.upsert({
      where: { code: "CENTRO-CIVICO" },
      update: {},
      create: {
        id: "seed-b-centro",
        code: "CENTRO-CIVICO",
        name: "Centro Cívico",
        address: "Calle Sevilla, 20",
        sortOrder: 2,
      },
    }),
  ]);

  const floorDefs = [
    {
      id: "seed-f-casa-pb",
      buildingId: "seed-b-casa",
      name: "Planta baja",
      level: 0,
      title: "Casa Consistorial — Planta baja",
      rooms: [
        { code: "PB-01", x: 60, y: 100, w: 220, h: 150 },
        { code: "PB-02", x: 320, y: 100, w: 220, h: 150 },
        { code: "PB-03", x: 580, y: 100, w: 220, h: 150 },
        { code: "PB-04", x: 840, y: 100, w: 220, h: 150 },
      ],
    },
    {
      id: "seed-f-casa-p1",
      buildingId: "seed-b-casa",
      name: "Primera",
      level: 1,
      title: "Casa Consistorial — Primera planta",
      rooms: [
        { code: "P1-06", x: 60, y: 100, w: 260, h: 160 },
        { code: "P1-07", x: 360, y: 100, w: 260, h: 160 },
      ],
    },
    {
      id: "seed-f-centro-pb",
      buildingId: "seed-b-centro",
      name: "Planta baja",
      level: 0,
      title: "Centro Cívico — Planta baja",
      rooms: [
        { code: "CC-01", x: 80, y: 120, w: 280, h: 180 },
        { code: "CC-02", x: 400, y: 120, w: 280, h: 180 },
      ],
    },
  ];

  const plansDir = path.join(UPLOADS_DIR, "plans");
  mkdirSync(plansDir, { recursive: true });

  const floors = [];
  for (const def of floorDefs) {
    const file = `plans/${def.id}.svg`;
    writeFileSync(
      path.join(UPLOADS_DIR, file),
      planSvg(def.title, 1200, 800, def.rooms),
      "utf8",
    );
    floors.push(
      await prisma.floor.upsert({
        where: { buildingId_name: { buildingId: def.buildingId, name: def.name } },
        update: { planFile: file, planWidth: 1200, planHeight: 800 },
        create: {
          id: def.id,
          buildingId: def.buildingId,
          name: def.name,
          level: def.level,
          planFile: file,
          planWidth: 1200,
          planHeight: 800,
        },
      }),
    );
  }

  const departments = [];
  for (const def of [
    { id: "seed-d-interv", code: "INTERV", name: "Intervención" },
    { id: "seed-d-secret", code: "SECRET", name: "Secretaría" },
    { id: "seed-d-ssocia", code: "SSOCIA", name: "Servicios Sociales" },
    { id: "seed-d-inform", code: "INFORM", name: "Informática" },
  ]) {
    departments.push(
      await prisma.department.upsert({
        where: { code: def.code },
        update: {},
        create: def,
      }),
    );
  }

  const officeDefs = [
    { id: "seed-o-pb01", floorId: "seed-f-casa-pb", code: "PB-01", name: "Atención al ciudadano", departmentId: "seed-d-secret", rect: { x: 0.05, y: 0.125, w: 0.183, h: 0.1875 } },
    { id: "seed-o-pb02", floorId: "seed-f-casa-pb", code: "PB-02", name: "Padrón", departmentId: "seed-d-secret", rect: { x: 0.267, y: 0.125, w: 0.183, h: 0.1875 } },
    { id: "seed-o-pb03", floorId: "seed-f-casa-pb", code: "PB-03", name: "Servicios Sociales", departmentId: "seed-d-ssocia", rect: { x: 0.483, y: 0.125, w: 0.183, h: 0.1875 } },
    { id: "seed-o-pb04", floorId: "seed-f-casa-pb", code: "PB-04", name: "Sala de espera", departmentId: null, rect: null },
    { id: "seed-o-p106", floorId: "seed-f-casa-p1", code: "P1-06", name: "Alcaldía", departmentId: "seed-d-secret", rect: { x: 0.05, y: 0.125, w: 0.217, h: 0.2 } },
    { id: "seed-o-p107", floorId: "seed-f-casa-p1", code: "P1-07", name: "Despacho Intervención", departmentId: "seed-d-interv", rect: { x: 0.3, y: 0.125, w: 0.217, h: 0.2 } },
    { id: "seed-o-cc01", floorId: "seed-f-centro-pb", code: "CC-01", name: "Aula de informática", departmentId: "seed-d-inform", rect: null },
    { id: "seed-o-cc02", floorId: "seed-f-centro-pb", code: "CC-02", name: "Sala polivalente", departmentId: null, rect: null },
  ];
  for (const def of officeDefs) {
    await prisma.office.upsert({
      where: { floorId_code: { floorId: def.floorId, code: def.code } },
      update: { rect: def.rect ?? undefined },
      create: {
        id: def.id,
        floorId: def.floorId,
        code: def.code,
        name: def.name,
        departmentId: def.departmentId,
        rect: def.rect ?? Prisma.DbNull,
      },
    });
  }

  return { buildings, floors, departments };
}

async function seedCredential(vncEncKey: string) {
  return prisma.vncCredential.upsert({
    where: { name: "Estándar 2024" },
    update: {},
    create: {
      id: "seed-cred-std",
      name: "Estándar 2024",
      passwordEnc: encryptSecret(SEED_VNC_PASSWORD, vncEncKey),
      isDefault: true,
    },
  });
}

type ComputerSpec = {
  n: number;
  hostname: string;
  state: "READY" | "NOT_LISTENING" | "NOT_INSTALLED" | "OFFLINE" | "UNKNOWN";
  floorId?: string;
  officeId?: string;
  departmentId?: string;
  posX?: number;
  posY?: number;
  staleInventory?: boolean;
  monitorCount?: number;
  screens?: number;
};

function buildComputers(): ComputerSpec[] {
  const states: ComputerSpec["state"][] = [
    "READY",
    "READY",
    "NOT_LISTENING",
    "NOT_INSTALLED",
    "OFFLINE",
    "UNKNOWN",
    "READY",
    "OFFLINE",
    "NOT_LISTENING",
    "READY",
  ];
  const placements: Partial<ComputerSpec>[] = [
    { floorId: "seed-f-casa-pb", officeId: "seed-o-pb01", departmentId: "seed-d-secret", posX: 0.12, posY: 0.22 },
    { floorId: "seed-f-casa-pb", officeId: "seed-o-pb01", departmentId: "seed-d-secret", posX: 0.18, posY: 0.25 },
    { floorId: "seed-f-casa-pb", officeId: "seed-o-pb02", departmentId: "seed-d-secret", posX: 0.33, posY: 0.21 },
    { floorId: "seed-f-casa-pb", officeId: "seed-o-pb03", departmentId: "seed-d-ssocia", posX: 0.55, posY: 0.23 },
    { floorId: "seed-f-casa-pb", departmentId: "seed-d-ssocia", posX: 0.62, posY: 0.3 },
    { floorId: "seed-f-casa-p1", officeId: "seed-o-p106", departmentId: "seed-d-secret", posX: 0.14, posY: 0.2 },
    { floorId: "seed-f-casa-p1", officeId: "seed-o-p107", departmentId: "seed-d-interv", posX: 0.38, posY: 0.22 },
    { floorId: "seed-f-casa-p1", officeId: "seed-o-p107", departmentId: "seed-d-interv", posX: 0.45, posY: 0.26 },
    { floorId: "seed-f-centro-pb", officeId: "seed-o-cc01", departmentId: "seed-d-inform", posX: 0.2, posY: 0.25 },
    { floorId: "seed-f-centro-pb", officeId: "seed-o-cc02", posX: 0.5, posY: 0.28 },
  ];

  const specs: ComputerSpec[] = [];
  for (let i = 0; i < 40; i++) {
    const n = i + 1;
    const state = states[i % states.length];
    const placement = i < placements.length ? placements[i] : i % 3 === 0 ? {} : placements[i % placements.length];
    specs.push({
      n,
      hostname: `PC-${String(n).padStart(2, "0")}-SEED`,
      state,
      ...placement,
      staleInventory: i % 7 === 3,
    });
  }
  // 4 equipos con 2 pantallas y 1 con 3 (DM-8 / T-43)
  specs[35].monitorCount = 2;
  specs[35].screens = 2;
  specs[36].monitorCount = 2;
  specs[36].screens = 2;
  specs[37].monitorCount = 2;
  specs[37].screens = 2;
  specs[38].monitorCount = 2;
  specs[38].screens = 2;
  specs[39].monitorCount = 3;
  specs[39].screens = 3;
  return specs;
}

async function seedComputers(credentialId: string) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const people = [
    { login: "mlopez", name: "María López" },
    { login: "jgarcia", name: "Juan García" },
    { login: "aromero", name: "Ana Romero" },
    { login: "lortega", name: "Luis Ortega" },
    { login: "cruiz", name: "Carmen Ruiz" },
    { login: "pleon", name: "Pedro León" },
  ];
  const osVersions = ["Windows 10 Pro 22H2", "Windows 11 Pro 23H2", "Windows 10 Pro 21H2"];

  for (const spec of buildComputers()) {
    const hostname = normalizeHostname(spec.hostname);
    const base = {
      ip: `10.58.1.${100 + spec.n}`,
      mac: `00:1B:44:11:3A:${String(spec.n).padStart(2, "0")}`,
      domain: "Mairena",
      manufacturer: spec.n % 2 === 0 ? "Dell" : "HP",
      model: spec.n % 2 === 0 ? "OptiPlex 7090" : "ProDesk 600 G6",
      serial: `SEED${String(spec.n).padStart(5, "0")}`,
      os: "Windows",
      osVersion: osVersions[spec.n % osVersions.length],
      cpu: "Intel Core i5-10500",
      ramMb: spec.n % 3 === 0 ? 8192 : 16384,
      diskGb: 512,
        lastUser: spec.n % 9 === 5 ? null : people[spec.n % people.length].login,
        lastUserNorm: spec.n % 9 === 5 ? null : normalizeAdUser(people[spec.n % people.length].login),
        adUsername:
          spec.n % 4 === 0
            ? null
            : spec.n % 7 === 2
              ? "usuario.distinto"
              : normalizeAdUser(people[spec.n % people.length].login),
      lastInventoryAt: spec.staleInventory ? new Date(now - 45 * day) : new Date(now - 2 * day),
      source: "GLPI" as const,
      glpiId: 9000 + spec.n,
    };

    let live: {
      online: boolean | null;
      vncReachable: boolean | null;
      vncInstalled: "YES" | "NO" | "UNKNOWN";
      vncInstalledSrc: string | null;
      lastProbeAt: Date | null;
      lastSeenAt: Date | null;
      lastVncOkAt: Date | null;
      rfbVersion: string | null;
    };
    switch (spec.state) {
      case "READY":
        live = {
          online: true,
          vncReachable: true,
          vncInstalled: "YES",
          vncInstalledSrc: "PROBE",
          lastProbeAt: new Date(now - 5 * 60 * 1000),
          lastSeenAt: new Date(now - 5 * 60 * 1000),
          lastVncOkAt: new Date(now - 5 * 60 * 1000),
          rfbVersion: "003.008",
        };
        break;
      case "NOT_LISTENING":
        live = {
          online: true,
          vncReachable: false,
          vncInstalled: "UNKNOWN",
          vncInstalledSrc: null,
          lastProbeAt: new Date(now - 8 * 60 * 1000),
          lastSeenAt: new Date(now - 8 * 60 * 1000),
          lastVncOkAt: null,
          rfbVersion: null,
        };
        break;
      case "NOT_INSTALLED":
        live = {
          online: true,
          vncReachable: false,
          vncInstalled: "NO",
          vncInstalledSrc: "PROBE",
          lastProbeAt: new Date(now - 10 * 60 * 1000),
          lastSeenAt: new Date(now - 10 * 60 * 1000),
          lastVncOkAt: null,
          rfbVersion: null,
        };
        break;
      case "OFFLINE":
        live = {
          online: false,
          vncReachable: false,
          vncInstalled: "YES",
          vncInstalledSrc: "PROBE",
          lastProbeAt: new Date(now - 12 * 60 * 1000),
          lastSeenAt: new Date(now - 2 * day),
          lastVncOkAt: new Date(now - 2 * day),
          rfbVersion: null,
        };
        break;
      default:
        live = {
          online: null,
          vncReachable: null,
          vncInstalled: "UNKNOWN",
          vncInstalledSrc: null,
          lastProbeAt: null,
          lastSeenAt: null,
          lastVncOkAt: null,
          rfbVersion: null,
        };
    }

    await prisma.computer.upsert({
      where: { hostname },
      update: {},
      create: {
        id: `seed-c-${String(spec.n).padStart(2, "0")}`,
        hostname,
        ...base,
        assignedTo: people[spec.n % people.length].name,
        phoneExt: String(2100 + spec.n),
        notes: spec.staleInventory ? "Equipo sin inventario en GLPI en más de 30 días" : null,
        assetTag: `INV-${String(spec.n).padStart(5, "0")}`,
        floorId: spec.floorId ?? null,
        officeId: spec.officeId ?? null,
        departmentId: spec.departmentId ?? null,
        posX: spec.posX ?? null,
        posY: spec.posY ?? null,
        vncPort: 5900,
        credentialId,
        monitorCount: spec.monitorCount ?? 1,
        ...live,
      },
    });

    if (spec.screens && spec.screens > 0) {
      for (let s = 1; s <= spec.screens; s++) {
        await prisma.computerScreen.upsert({
          where: { computerId_index: { computerId: `seed-c-${String(spec.n).padStart(2, "0")}`, index: s } },
          update: {},
          create: {
            computerId: `seed-c-${String(spec.n).padStart(2, "0")}`,
            index: s,
            label: `Pantalla ${s}`,
            port: 5900 + s,
            source: "PROBE",
            enabled: true,
            reachable: spec.state === "READY",
            lastProbeAt: new Date(now - 5 * 60 * 1000),
            lastOkAt: spec.state === "READY" ? new Date(now - 5 * 60 * 1000) : null,
          },
        });
      }
    }
  }
}

async function main() {
  const vncEncKey = process.env.VNC_ENC_KEY;
  if (!vncEncKey) {
    throw new Error(
      "Falta VNC_ENC_KEY en el entorno. Genera secretos con `npm run gen:secrets` y completa .env",
    );
  }

  let adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!adminPassword) {
    adminPassword = randomBytes(9).toString("base64url");
    console.warn(
      `[seed] ADMIN_INITIAL_PASSWORD no definido; contraseña generada para '${ADMIN_USER}': ${adminPassword}`,
    );
    console.warn("[seed] Cámbiala tras el primer acceso.");
  }

  await prisma.user.upsert({
    where: { username: ADMIN_USER },
    update: {},
    create: {
      id: "seed-user-admin",
      username: ADMIN_USER,
      name: "Administrador",
      passwordHash: bcrypt.hashSync(adminPassword, 12),
      role: "ADMIN",
      active: true,
    },
  });

  await seedStructure();
  const credential = await seedCredential(vncEncKey);
  await seedComputers(credential.id);
  const backfilled = await backfillLastUserNorm(prisma);
  if (backfilled > 0) console.log(`[seed] backfill lastUserNorm: ${backfilled} equipos`);

  const counts = {
    users: await prisma.user.count(),
    buildings: await prisma.building.count(),
    floors: await prisma.floor.count(),
    departments: await prisma.department.count(),
    offices: await prisma.office.count(),
    credentials: await prisma.vncCredential.count(),
    computers: await prisma.computer.count(),
    screens: await prisma.computerScreen.count(),
  };
  console.log("[seed] completado:", counts);
}

main()
  .catch((err) => {
    console.error("[seed] error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
