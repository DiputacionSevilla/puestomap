import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPrisma } from "@puestomap/db";
import { deriveMultiState, deriveVncState, normalizeAdUser } from "@puestomap/shared";
import { auth } from "@/auth";
import { StateBadge } from "@/components/state-badge";
import { ComputerDetail } from "@/components/computers/computer-detail";
import { ComputerActions } from "@/components/computers/computer-actions";
import { formatDateTime, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ComputerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const prisma = getPrisma();

  const computer = await prisma.computer.findUnique({
    where: { id },
    include: {
      floor: { select: { id: true, name: true, building: { select: { id: true, code: true, name: true } } } },
      office: { select: { id: true, code: true, name: true, rect: true } },
      department: { select: { id: true, code: true, name: true } },
      credential: { select: { id: true, name: true, isDefault: true } },
      screens: { orderBy: { index: "asc" } },
    },
  });
  if (!computer) notFound();

  const role = session.user.role;
  const normalizedLastUser = normalizeAdUser(computer.lastUserNorm ?? computer.lastUser);
  const [sessions, audits, structure, directoryUsers] = await Promise.all([
    prisma.remoteSession.findMany({
      where: { computerId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true, username: true } } },
    }),
    prisma.auditLog.findMany({
      where: { entity: "Computer", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true, username: true } } },
    }),
    Promise.all([
      prisma.building.findMany({
        orderBy: { name: "asc" },
        include: { floors: { orderBy: { level: "asc" }, select: { id: true, name: true } } },
      }),
      prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
      prisma.vncCredential.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]),
    role === "VIEWER"
      ? Promise.resolve([])
      : prisma.directoryUser.findMany({
          where: { username: { in: [computer.adUsername, normalizedLastUser].filter((value): value is string => Boolean(value)) } },
          select: { username: true, displayName: true, department: true, phone: true },
        }),
  ]);

  const state = deriveVncState({
    online: computer.online,
    vncReachable: computer.vncReachable,
    vncInstalled: computer.vncInstalled,
    vncOverride: computer.vncOverride,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{computer.hostname}</h1>
            <StateBadge state={state} />
            {computer.archived ? (
              <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase text-muted-foreground">
                archivado
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {computer.ip ?? "sin IP"} · {computer.lastUser ?? "sin usuario"} ·{" "}
            {computer.assignedTo ? `Asignado a ${computer.assignedTo}` : "sin asignar"} · Último sondeo{" "}
            {formatRelative(computer.lastProbeAt)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <Link href="/equipos" className="underline-offset-2 hover:underline">
              ← Volver al listado
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ComputerActions
            computer={{
              id: computer.id,
              hostname: computer.hostname,
              ip: computer.ip,
              vncPort: computer.vncPort,
              placed: Boolean(computer.floorId),
              screens: computer.screens,
              multiState: deriveMultiState({ monitorCount: computer.monitorCount, screens: computer.screens }),
            }}
            canAssist={role !== "VIEWER"}
          />
          <p className="text-xs text-muted-foreground">
            Origen: {computer.source} · Actualizado {formatDateTime(computer.updatedAt)}
          </p>
        </div>
      </div>

      <ComputerDetail
        computer={JSON.parse(JSON.stringify({
          ...computer,
          directoryUser: directoryUsers.find((user) => user.username === computer.adUsername) ?? null,
          lastUserDirectoryName: directoryUsers.find((user) => user.username === normalizedLastUser)?.displayName ?? null,
        }))}
        sessions={JSON.parse(
          JSON.stringify(sessions, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
        )}
        audits={JSON.parse(JSON.stringify(audits))}
        structure={{
          buildings: structure[0].map((b) => ({
            id: b.id,
            name: b.name,
            floors: b.floors,
          })),
          departments: structure[1],
          credentials: structure[2],
        }}
        canEdit={role !== "VIEWER"}
        canAdmin={role === "ADMIN"}
      />
    </div>
  );
}
