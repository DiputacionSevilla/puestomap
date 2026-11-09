"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NotSynced({ canSync }: { canSync: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  async function sync() {
    const res = await fetch("/api/sync/glpi", { method: "POST" });
    setMessage(res.ok ? "Sincronización solicitada; vuelve a abrir el enlace en un minuto." : "No se pudo solicitar la sincronización.");
  }
  return (
    <Card className="mx-auto mt-12 max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">Todavía no sincronizado</CardTitle>
        <CardDescription>Este equipo aún no está en PuestoMap. Se importa desde GLPI en el siguiente ciclo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canSync ? <Button onClick={sync}>Sincronizar ahora</Button> : null}
        {message ? <p className="text-sm text-green-600">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
