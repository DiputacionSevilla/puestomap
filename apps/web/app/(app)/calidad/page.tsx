import Link from "next/link";
import { redirect } from "next/navigation";
import { QUALITY_CHECKS, QUALITY_LABELS } from "@puestomap/shared";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadQualitySnapshot } from "@/lib/quality";

export const dynamic = "force-dynamic";

export default async function CalidadPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/");
  const { checks, byBuilding } = await loadQualitySnapshot();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calidad de datos</h1>
        <p className="text-sm text-muted-foreground">Pendientes de ubicación, inventario y asignación de usuarios.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {QUALITY_CHECKS.map((check) => (
          <Card key={check}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{QUALITY_LABELS[check]}</CardTitle></CardHeader>
            <CardContent className="flex items-end justify-between gap-3">
              <Link href={`/equipos?check=${check}`} className="text-3xl font-semibold text-primary hover:underline">{checks[check]}</Link>
              <a href={`/api/quality/${check}.csv`} className="text-xs text-muted-foreground underline">CSV</a>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Cobertura por edificio</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Edificio</TableHead><TableHead>Equipos</TableHead><TableHead>Ubicados en plano</TableHead><TableHead>Con usuario</TableHead></TableRow></TableHeader>
            <TableBody>{byBuilding.map((building) => (
              <TableRow key={building.buildingId}><TableCell>{building.name}</TableCell><TableCell>{building.total}</TableCell><TableCell>{building.placedPct}%</TableCell><TableCell>{building.withUserPct}%</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
