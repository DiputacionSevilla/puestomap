import Link from "next/link";
import { getPrisma } from "@puestomap/db";
import {
  STALE_OCS_DAYS,
  deriveMultiStateFrom,
  stateWhere,
} from "@/lib/computers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const prisma = getPrisma();
  const staleCutoff = new Date(Date.now() - STALE_OCS_DAYS * 24 * 60 * 60 * 1000);
  const base = { archived: false };

  const [total, ready, notListening, notInstalled, offlineOrUnknown, unplaced, staleOcs, rows] =
    await Promise.all([
      prisma.computer.count({ where: base }),
      prisma.computer.count({ where: { ...base, ...stateWhere("READY") } }),
      prisma.computer.count({ where: { ...base, ...stateWhere("NOT_LISTENING") } }),
      prisma.computer.count({ where: { ...base, ...stateWhere("NOT_INSTALLED") } }),
      prisma.computer.count({
        where: { ...base, OR: [stateWhere("OFFLINE"), stateWhere("UNKNOWN")] },
      }),
      prisma.computer.count({
        where: { ...base, OR: [{ floorId: null }, { posX: null }, { posY: null }] },
      }),
      prisma.computer.count({ where: { ...base, ocsLastInventory: { lt: staleCutoff } } }),
      prisma.computer.findMany({
        where: base,
        include: {
          floor: { select: { buildingId: true, building: { select: { name: true } } } },
          screens: {
            select: { index: true, port: true, label: true, enabled: true, source: true },
          },
        },
      }),
    ]);

  let multiPending = 0;
  const byBuilding = new Map<
    string,
    { name: string; total: number; ready: number; notListening: number; notInstalled: number; offlineOrUnknown: number }
  >();
  for (const row of rows) {
    if (deriveMultiStateFrom(row) === "MULTI_PENDING") multiPending += 1;
    const key = row.floor?.buildingId ?? "sin";
    const entry = byBuilding.get(key) ?? {
      name: row.floor?.building.name ?? "Sin edificio",
      total: 0,
      ready: 0,
      notListening: 0,
      notInstalled: 0,
      offlineOrUnknown: 0,
    };
    entry.total += 1;
    const state = row.online === true && row.vncReachable === true
      ? "READY"
      : row.online === true && row.vncReachable === false
        ? "NOT_LISTENING"
        : row.vncOverride === "NO" || (row.vncOverride === null && row.vncInstalled === "NO")
          ? "NOT_INSTALLED"
          : row.online === false
            ? "OFFLINE"
            : "UNKNOWN";
    if (state === "READY") entry.ready += 1;
    else if (state === "NOT_LISTENING") entry.notListening += 1;
    else if (state === "NOT_INSTALLED") entry.notInstalled += 1;
    else entry.offlineOrUnknown += 1;
    byBuilding.set(key, entry);
  }

  const lastSessions = await prisma.remoteSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      user: { select: { name: true, username: true } },
      computer: { select: { id: true, hostname: true } },
    },
  });

  const kpis: { label: string; value: number; href: string }[] = [
    { label: "Total equipos", value: total, href: "/equipos" },
    { label: "Listos", value: ready, href: "/equipos?state=READY" },
    { label: "Sin VNC", value: notListening, href: "/equipos?state=NOT_LISTENING" },
    { label: "Sin instalar", value: notInstalled, href: "/equipos?state=NOT_INSTALLED" },
    { label: "Apagados / sin datos", value: offlineOrUnknown, href: "/equipos?state=OFFLINE,UNKNOWN" },
    { label: "Sin ubicar", value: unplaced, href: "/equipos?unplaced=true" },
    { label: "No vistos en OCS > 30 d", value: staleOcs, href: "/equipos?staleOcs=true" },
    { label: "Multipantalla pendiente", value: multiPending, href: "/equipos?multiPending=true" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href}>
            <Card className="transition-colors hover:border-primary">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-semibold">{kpi.value}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Resumen por edificio</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Edificio</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Listos</TableHead>
                  <TableHead>Sin VNC</TableHead>
                  <TableHead>Sin instalar</TableHead>
                  <TableHead>Apagados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(byBuilding.values()).map((entry) => (
                  <TableRow key={entry.name}>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell>{entry.total}</TableCell>
                    <TableCell className="text-green-600">{entry.ready}</TableCell>
                    <TableCell className="text-amber-600">{entry.notListening}</TableCell>
                    <TableCell className="text-red-600">{entry.notInstalled}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.offlineOrUnknown}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Últimas sesiones remotas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Duración</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lastSessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>{formatDateTime(session.createdAt)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/equipos/${session.computer.id}`}
                        className="text-primary hover:underline"
                      >
                        {session.computer.hostname}
                      </Link>
                    </TableCell>
                    <TableCell>{session.user.name || session.user.username}</TableCell>
                    <TableCell>
                      <Badge variant={session.status === "ACTIVE" ? "default" : "secondary"}>
                        {session.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatDuration(session.startedAt ?? session.createdAt, session.endedAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {lastSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      Sin sesiones todavía.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              <Link href="/sesiones" className="underline">
                Ver todas las sesiones
              </Link>{" "}
              · Último sondeo registrado {formatRelative(
                rows.reduce<Date | null>(
                  (acc, r) => (r.lastProbeAt && (!acc || r.lastProbeAt > acc) ? r.lastProbeAt : acc),
                  null,
                ),
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
