import { getPrisma } from "@puestomap/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  const params = await searchParams;
  const prisma = getPrisma();

  const where = {
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.action ? { action: { contains: params.action, mode: "insensitive" as const } } : {}),
    ...(params.entity ? { entity: params.entity } : {}),
    ...(params.from || params.to
      ? {
          createdAt: {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lte: new Date(params.to) } : {}),
          },
        }
      : {}),
  };

  const [total, items, users] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { username: true, name: true } } },
    }),
    prisma.user.findMany({ select: { id: true, username: true }, orderBy: { username: "asc" } }),
  ]);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
        <a
          href={`/api/audit?${query.toString()}&format=csv`}
          className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"
        >
          Exportar CSV
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-5">
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
              <Label htmlFor="action">Acción</Label>
              <Input id="action" name="action" defaultValue={params.action ?? ""} placeholder="session.start" />
            </div>
            <div>
              <Label htmlFor="entity">Entidad</Label>
              <Input id="entity" name="entity" defaultValue={params.entity ?? ""} placeholder="Computer" />
            </div>
            <div>
              <Label htmlFor="from">Desde</Label>
              <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} />
            </div>
            <div>
              <Label htmlFor="to">Hasta</Label>
              <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} />
            </div>
            <div className="md:col-span-5">
              <Button type="submit" size="sm">
                Filtrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="mb-2 text-sm text-muted-foreground">{total} registros (mostrando los 100 más recientes)</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Datos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>{entry.user?.username ?? "sistema"}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>
                    {entry.entity ?? "—"}
                    {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ""}
                  </TableCell>
                  <TableCell>{entry.ip ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs">
                    {entry.data ? JSON.stringify(entry.data) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
