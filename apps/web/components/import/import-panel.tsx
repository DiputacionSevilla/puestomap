"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ImportIssue = { code: string; detail: string };

function PositionsTab() {
  const [csv, setCsv] = useState("hostname;pos_x;pos_y;despacho_codigo\r\n");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/import/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) return setResult(data?.error?.message ?? "No se pudo procesar.");
      const lines = (data.errors as { line: number; hostname: string; errors: ImportIssue[] }[])
        .map((e) => `Línea ${e.line} (${e.hostname}): ${e.errors.map((i) => i.detail).join("; ")}`);
      setResult(
        `${dryRun ? "Validación" : "Aplicado"}: ${data.total} fila(s), ${dryRun ? "sin escribir" : `${data.applied} aplicada(s)`}, ${lines.length} con error.\n${lines.join("\n")}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Posiciones de los equipos (posiciones.csv)</CardTitle>
        <CardDescription>
          Columnas: hostname;pos_x;pos_y;despacho_codigo (opcional). Solo coloca equipos ya sincronizados desde GLPI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) setCsv(await file.text());
          }}
        />
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void run(true)}>Validar</Button>
          <Button disabled={busy} onClick={() => void run(false)}>Aplicar</Button>
        </div>
        {result ? <pre className="whitespace-pre-wrap text-xs">{result}</pre> : null}
      </CardContent>
    </Card>
  );
}

export function ImportPanel() {
  return <PositionsTab />;
}
