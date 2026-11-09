import { Suspense } from "react";
import { getPrisma } from "@puestomap/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ComputersExplorer } from "@/components/computers/computers-explorer";

export const dynamic = "force-dynamic";

export default async function EquiposPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const prisma = getPrisma();
  const [buildings, departments, offices, credentials] = await Promise.all([
    prisma.building.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { floors: { orderBy: { level: "asc" }, select: { id: true, name: true } } },
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.office.findMany({
      select: { id: true, code: true, name: true, floorId: true },
      orderBy: { code: "asc" },
    }),
    prisma.vncCredential.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const role = session.user.role;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Equipos</h1>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <ComputersExplorer
          structure={{
            buildings: buildings.map((b) => ({
              id: b.id,
              name: b.name,
              floors: b.floors.map((f) => ({ id: f.id, name: f.name })),
            })),
            departments,
            offices,
            credentials,
          }}
          canAssist={role !== "VIEWER"}
          canBulk={role === "ADMIN"}
        />
      </Suspense>
    </div>
  );
}
