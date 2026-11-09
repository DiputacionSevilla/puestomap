import { getPrisma } from "@puestomap/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { StructureAdmin } from "@/components/structure/structure-admin";

export const dynamic = "force-dynamic";

export default async function EstructuraPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const prisma = getPrisma();

  const [buildings, departments, offices] = await Promise.all([
    prisma.building.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        floors: {
          orderBy: { level: "asc" },
          include: { _count: { select: { computers: true, offices: true } } },
        },
      },
    }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { computers: true, offices: true } } },
    }),
    prisma.office.findMany({
      orderBy: [{ floor: { building: { name: "asc" } } }, { code: "asc" }],
      include: {
        floor: { select: { id: true, name: true, building: { select: { name: true } } } },
        department: { select: { id: true, name: true } },
        _count: { select: { computers: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Estructura física</h1>
      <StructureAdmin
        data={JSON.parse(JSON.stringify({ buildings, departments, offices }))}
        isAdmin={session.user.role === "ADMIN"}
      />
    </div>
  );
}
