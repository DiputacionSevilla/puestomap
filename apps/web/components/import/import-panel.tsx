"use client";

import { useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";

type ImportIssue = { code: string; detail: string };
type PreviewRow = {
  line: number;
  action: string;
  data: unknown;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

const TEMPLATE_COMPUTERS =
  "\uFEFFhostname;ip;asignado_a;extension;edificio_codigo;planta_nombre;despacho_codigo;departamento_codigo;pos_x;pos_y;puerto_vnc;credencial;notas;asset_tag;usuario_dominio\r\nPC-INT-01;10.1.2.34;María López;2104;AYTO;Planta baja;PB-01;INTERV;0.4215;0.3380;5900;Estándar 2024;;INV-00123;AYTO\\mlopez\r\n";

const TEMPLATE_STRUCTURE =
  "\uFEFFtipo;codigo;nombre;edificio_codigo;planta_nombre;nivel;departamento_codigo;rect_x;rect_y;rect_w;rect_h\r\nEDIFICIO;AYTO;Ayuntamiento;;;;;;;\r\nPLANTA;;Planta baja;AYTO;;0;;;\r\nDEPARTAMENTO;INTERV;Intervención;;;;;\r\nDESPACHO;PB-01;Despacho 1;AYTO;Planta baja;;INTERV;0.1;0.1;0.2;0.2\r\n";
const TEMPLATE_DIRECTORY =
  "\uFEFFSamAccountName;DisplayName;GivenName;Surname;Department;Title;Office;TelephoneNumber\r\njlopez;Juana López;Juana;López;Intervención;Administrativa;PB-01;2104\r\n";

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function actionBadge(action: string) {
  const variant =
    action === "error" ? "destructive" : action === "sin cambios" ? "secondary" : "default";
  return <Badge variant={variant}>{action}</Badge>;
}

export function ImportTab({ kind }: { kind: "computers" | "structure" | "directory" }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [crearEquipos, setCrearEquipos] = useState(true);
  const [omitirErrores, setOmitirErrores] = useState(false);
  const [marcarAusentesInactivos, setMarcarAusentesInactivos] = useState(false);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [result, setResult] = useState<Record<string, number | string | null> | null>(null);
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
        body: JSON.stringify({ csv, crearEquipos, marcarAusentesInactivos }),
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
        body: JSON.stringify({ csv, crearEquipos, omitirErrores, marcarAusentesInactivos, fileName }),
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
          {kind === "computers" ? "Importar equipos" : kind === "structure" ? "Importar estructura física" : "Importar directorio de usuarios"}
        </CardTitle>
        <CardDescription>
          CSV en UTF-8 con separador «;», columnas por cabecera (el orden no importa). Las celdas
          vacías no modifican los datos existentes. Las filas con errores no se importan.
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
                kind === "computers" ? "plantilla-equipos.csv" : kind === "structure" ? "plantilla-estructura.csv" : "plantilla-ad-usuarios.csv",
                kind === "computers" ? TEMPLATE_COMPUTERS : kind === "structure" ? TEMPLATE_STRUCTURE : TEMPLATE_DIRECTORY,
              )
            }
          >
            <Download className="h-4 w-4" />
            Descargar plantilla
          </Button>
          {kind === "computers" ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={crearEquipos} onChange={(e) => setCrearEquipos(e.target.checked)} />
                Crear equipos desconocidos
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={omitirErrores} onChange={(e) => setOmitirErrores(e.target.checked)} />
                Omitir filas con error
              </label>
            </>
          ) : null}
          {kind === "directory" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={marcarAusentesInactivos} onChange={(e) => setMarcarAusentesInactivos(e.target.checked)} />
              Marcar como inactivos los usuarios ausentes
            </label>
          ) : null}
          <Button onClick={preview} disabled={!csv || busy}>
            Previsualizar
          </Button>
          <Button onClick={commit} disabled={!rows || busy || summary?.errores === summary?.total}>
            Confirmar importación
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {summary ? (
          <p className="text-sm">
            {summary.total} filas · {summary.crear ?? 0} crear · {summary.actualizar ?? 0} actualizar ·{" "}
            {summary.sinCambios ?? 0} sin cambios · {summary.errores ?? 0} con errores ·{" "}
            {summary.avisos ?? 0} con avisos
          </p>
        ) : null}

        {result ? (
          <div className="space-y-1 text-sm text-green-600">
            <p>
              Importación completada: {result.created ?? 0} creados, {result.updated ?? 0} actualizados,{" "}
              {result.unchanged ?? 0} sin cambios, {result.errors ?? 0} con errores.
            </p>
            {typeof result.erroresUrl === "string" && result.erroresUrl ? (
              <a className="underline" href={result.erroresUrl}>
                Descargar errores.csv
              </a>
            ) : null}
          </div>
        ) : null}

        {rows ? (
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Línea</TableHead>
                  <TableHead className="w-28">Estado</TableHead>
                  <TableHead>Contenido</TableHead>
                  <TableHead>Avisos / errores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.line} className={row.errors.length > 0 ? "bg-destructive/10" : ""}>
                    <TableCell>{row.line}</TableCell>
                    <TableCell>{actionBadge(row.action)}</TableCell>
                    <TableCell className="max-w-[380px] truncate text-xs">
                      {JSON.stringify(row.data)}
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs">
                      {row.errors.map((e) => (
                        <div key={`e${e.code}${e.detail}`} className="text-destructive">
                          {e.code}: {e.detail}
                        </div>
                      ))}
                      {row.warnings.map((w) => (
                        <div key={`w${w.code}${w.detail}`} className="text-amber-600">
                          {w.code}: {w.detail}
                        </div>
                      ))}
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

export function ImportPanel({ legacy = false }: { legacy?: boolean }) {
  if (!legacy) return <PositionsTab />;
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
