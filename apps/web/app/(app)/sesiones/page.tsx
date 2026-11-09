import Link from "next/link";
import { getPrisma } from "@puestomap/db";
import type { Prisma } from "@puestomap/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SesionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  const prisma = getPrisma();

  const where: Prisma.RemoteSessionWhereInput = {};
  if (params.status) where.status = params.status as Prisma.EnumSessionStatusFilter["equals"];
  if (params.userId) where.userId = params.userId;
  if (params.computerId) where.computerId = params.computerId;
  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: new Date(params.from) } : {}),
      ...(params.to ? { lte: new Date(params.to) } : {}),
    };
  }

  const [active, history, users, total] = await Promise.all([
    prisma.remoteSession.findMany({
      where: { ...where, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      include: {
        user: { select: { name: true, username: true } },
        computer: { select: { id: true, hostname: true } },
      },
    }),
    prisma.remoteSession.findMany({
      where: { ...where, status: { not: "ACTIVE" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { name: true, username: true } },
        computer: { select: { id: true, hostname: true } },
      },
    }),
    prisma.user.findMany({ select: { id: true, username: true }, orderBy: { username: "asc" } }),
    prisma.remoteSession.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Sesiones remotas</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-5">
            <div>
              <Label htmlFor="status">Estado</Label>
              <Select id="status" name="status" defaultValue={params.status ?? ""}>
                <option value="">Todos</option>
                <option value="ACTIVE">Activa</option>
                <option value="PENDING">Pendiente</option>
                <option value="ENDED">Terminada</option>
                <option value="FAILED">Fallida</option>
                <option value="EXPIRED">Caducada</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="userId">Usuario</Label>
              <Select id="userId" name="userId" defaultValue={params.userId ?? ""}>
                <option value="">Todos</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="from">Desde</Label>
              <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} />
            </div>
            <div>
              <Label htmlFor="to">Hasta</Label>
              <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} />
            </div>
            <div className="flex items-end">
              <Button type="submit" size="sm">
                Filtrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activas ahora ({active.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipo</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Pantalla</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.computer.hostname}</TableCell>
                  <TableCell>{s.user.name || s.user.username}</TableCell>
                  <TableCell>{formatDateTime(s.startedAt ?? s.createdAt)}</TableCell>
                  <TableCell>{formatDuration(s.startedAt ?? s.createdAt)}</TableCell>
                  <TableCell>{s.screenLabel ?? "Escritorio completo"}</TableCell>
                  <TableCell>
                    <Link href={`/equipos/${s.computer.id}`} className="text-primary hover:underline">
                      Ir a ficha
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {active.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    No hay sesiones activas.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Histórico ({total} registros, últimos 100)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inicio</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Datos</TableHead>
                <TableHead>Identidad</TableHead>
                <TableHead>Motivo / fin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{formatDateTime(s.createdAt)}</TableCell>
                  <TableCell>
                    <Link href={`/equipos/${s.computer.id}`} className="text-primary hover:underline">
                      {s.computer.hostname}
                    </Link>
                  </TableCell>
                  <TableCell>{s.user.name || s.user.username}</TableCell>
                  <TableCell>
                    {s.mode}
                    {s.screenLabel ? ` · ${s.screenLabel}` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === "ENDED" ? "secondary" : "destructive"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell>{formatDuration(s.startedAt ?? s.createdAt, s.endedAt)}</TableCell>
                  <TableCell>
                    ↓ {formatBytes(Number(s.bytesIn))} · ↑ {formatBytes(Number(s.bytesOut))}
                  </TableCell>
                  <TableCell>
                    {s.identityOk === false ? (
                      <span title={`Se identificó como ${s.desktopName}`} className="text-destructive">
                        ⚠ {s.desktopName}
                      </span>
                    ) : s.desktopName ? (
                      <span className="text-muted-foreground">✓</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs">
                    {s.reason ?? s.endReason ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                    Sin sesiones registradas.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
