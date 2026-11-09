"use client";

import { useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";

type PreviewRow = { line: number; data: unknown; errors: string[] };

const TEMPLATE_COMPUTERS =
  "\uFEFFhostname;ip;asignado_a;extension;edificio_codigo;planta_nombre;despacho_codigo;departamento_codigo;pos_x;pos_y;puerto_vnc;credencial;notas;asset_tag\r\nPC-INT-01;10.1.2.34;María López;2104;CASA-CONSIST;Primera;P1-07;INTERV;0.4215;0.3380;5900;Estándar 2024;;INV-00123\r\n";

const TEMPLATE_STRUCTURE =
  "\uFEFFtipo;codigo;nombre;edificio_codigo;planta_nombre;nivel;departamento_codigo\r\nEDIFICIO;CASA-CONSIST;Casa Consistorial;;;;\r\nPLANTA;;Primera;CASA-CONSIST;;1;\r\nDEPARTAMENTO;INTERV;Intervención;;;;\r\nDESPACHO;P1-07;Despacho Intervención;CASA-CONSIST;Primera;;INTERV\r\n";

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportTab({ kind }: { kind: "computers" | "structure" }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [createMissing, setCreateMissing] = useState(false);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; valid: number; invalid: number } | null>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function preview() {
    if (!csv) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/import/${kind}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, createMissing }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "No se pudo previsualizar.");
        return;
      }
      setRows(data.rows);
      setSummary(data.summary);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!csv) return;
    if (!window.confirm("¿Confirmar la importación? Se aplicarán los cambios sobre la base de datos.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/import/${kind}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, createMissing }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "No se pudo importar.");
        return;
      }
      setResult(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {kind === "computers" ? "Importar equipos" : "Importar estructura física"}
        </CardTitle>
        <CardDescription>
          CSV en UTF-8 con separador «;». Previsualiza antes de confirmar: las filas con errores no se
          importan.
          {kind === "computers"
            ? " Las celdas vacías no modifican los datos existentes."
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <FileUp className="h-4 w-4" />
            {fileName || "Elegir CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                file.text().then((text) => {
                  setCsv(text);
                  setRows(null);
                  setSummary(null);
                  setResult(null);
                });
              }}
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              download(
                kind === "computers" ? "plantilla-equipos.csv" : "plantilla-estructura.csv",
                kind === "computers" ? TEMPLATE_COMPUTERS : TEMPLATE_STRUCTURE,
              )
            }
          >
            <Download className="h-4 w-4" />
            Descargar plantilla
          </Button>
          {kind === "computers" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={createMissing}
                onChange={(e) => setCreateMissing(e.target.checked)}
              />
              Crear edificios/plantas/departamentos/despachos que no existan
            </label>
          ) : null}
          <Button onClick={preview} disabled={!csv || busy}>
            Previsualizar
          </Button>
          <Button onClick={commit} disabled={!rows || busy || summary?.valid === 0}>
            Confirmar importación
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {summary ? (
          <p className="text-sm">
            {summary.total} filas · {summary.valid} válidas · {summary.invalid} con errores
          </p>
        ) : null}

        {result ? (
          <p className="text-sm text-green-600">
            Importación completada: {result.created ?? 0} creados, {result.updated ?? 0} actualizados,
            {result.unchanged !== undefined ? ` ${result.unchanged} sin cambios,` : ""} {result.errors ?? 0} con
            errores.
          </p>
        ) : null}

        {rows ? (
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Línea</TableHead>
                  <TableHead>Contenido</TableHead>
                  <TableHead>Errores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.line} className={row.errors.length > 0 ? "bg-destructive/10" : ""}>
                    <TableCell>{row.line}</TableCell>
                    <TableCell className="max-w-[520px] truncate text-xs">
                      {JSON.stringify(row.data)}
                    </TableCell>
                    <TableCell className="text-xs text-destructive">
                      {row.errors.join("; ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ImportPanel() {
  return (
    <Tabs defaultValue="computers">
      <TabsList>
        <TabsTrigger value="computers">Equipos</TabsTrigger>
        <TabsTrigger value="structure">Estructura</TabsTrigger>
      </TabsList>
      <TabsContent value="computers">
        <ImportTab kind="computers" />
      </TabsContent>
      <TabsContent value="structure">
        <ImportTab kind="structure" />
      </TabsContent>
    </Tabs>
  );
}
