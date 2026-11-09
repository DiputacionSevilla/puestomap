import { getPrisma } from "@puestomap/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SettingsPanel } from "@/components/settings/settings-panel";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const prisma = getPrisma();
  const isAdmin = session.user.role === "ADMIN";

  const [syncRuns, credentials, users] = await Promise.all([
    prisma.syncRun.findMany({ where: { type: "GLPI" }, orderBy: { startedAt: "desc" }, take: 10 }),
    isAdmin || session.user.role === "TECH"
      ? prisma.vncCredential.findMany({
          orderBy: { name: "asc" },
          include: { _count: { select: { computers: true } } },
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.user.findMany({ orderBy: { username: "asc" } })
      : Promise.resolve([]),
  ]);

  const probeConfig: Record<string, string> = {
    PROBE_INTERVAL_MIN: process.env.PROBE_INTERVAL_MIN ?? "5",
    PROBE_CONCURRENCY: process.env.PROBE_CONCURRENCY ?? "32",
    PROBE_TIMEOUT_MS: process.env.PROBE_TIMEOUT_MS ?? "1500",
    PROBE_ONLINE_PORTS: process.env.PROBE_ONLINE_PORTS ?? "445,135,3389",
    VNC_DEFAULT_PORT: process.env.VNC_DEFAULT_PORT ?? "5900",
    VNC_ALLOWED_PORTS: process.env.VNC_ALLOWED_PORTS ?? "5900-5909",
    GLPI_SYNC_CRON: process.env.GLPI_SYNC_CRON ?? "*/30 * * * *",
    GLPI_URL: process.env.GLPI_URL ?? "(no configurada)",
    GLPI_SHADOW: process.env.GLPI_SHADOW ?? "true",
    ALLOWED_CIDRS: process.env.ALLOWED_CIDRS ?? "",
    SESSION_IDLE_TIMEOUT_MIN: process.env.SESSION_IDLE_TIMEOUT_MIN ?? "30",
    SESSION_MAX_HOURS: process.env.SESSION_MAX_HOURS ?? "4",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
      <SettingsPanel
        syncRuns={JSON.parse(JSON.stringify(syncRuns))}
        credentials={JSON.parse(JSON.stringify(credentials))}
        users={JSON.parse(JSON.stringify(users))}
        probeConfig={probeConfig}
        isAdmin={isAdmin}
        currentUserId={session.user.id}
      />
    </div>
  );
}
