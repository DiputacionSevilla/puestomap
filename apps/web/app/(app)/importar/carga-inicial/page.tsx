import { getPrisma } from "@puestomap/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { CargaInicialWizard } from "@/components/import/carga-inicial";

export const dynamic = "force-dynamic";

export default async function CargaInicialPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/importar");

  const prisma = getPrisma();
  const [buildings, floorsWithPlan, computers, directory] = await Promise.all([
    prisma.building.findMany({
      orderBy: { name: "asc" },
      include: { floors: { orderBy: { level: "asc" }, select: { id: true, name: true, planFile: true } } },
    }),
    prisma.floor.count({ where: { planFile: { not: null } } }),
    prisma.computer.count(),
    prisma.directoryUser.count(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Carga inicial</h1>
        <p className="text-sm text-muted-foreground">
          Asistente en 4 pasos para cargar edificios, planos, directorio y equipos. Cada paso es
          independiente y se puede omitir.
        </p>
      </div>
      <CargaInicialWizard
        structure={{
          buildings: buildings.map((b) => ({
            id: b.id,
            code: b.code,
            name: b.name,
            floors: b.floors,
          })),
          counts: {
            buildings: buildings.length,
            floorsWithPlan,
            computers,
            directory,
          },
        }}
      />
    </div>
  );
}
