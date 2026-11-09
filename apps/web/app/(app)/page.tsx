import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
      <Card>
        <CardHeader>
          <CardTitle>Panel en construcción</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            El panel de indicadores (RF-12) se implementa en la fase F6.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
