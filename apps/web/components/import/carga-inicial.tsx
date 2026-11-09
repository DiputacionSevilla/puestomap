"use client";

import { useState } from "react";
import Link from "next/link";
import { normKey } from "@puestomap/shared";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportTab } from "./import-panel";

export type WizardStructure = {
  buildings: {
    id: string;
    code: string;
    name: string;
    floors: { id: string; name: string; planFile: string | null }[];
  }[];
  counts: { buildings: number; floorsWithPlan: number; computers: number; directory: number };
};

type PlanAssignment = {
  file: File;
  floorId: string;
  matched: boolean;
  status: string;
};

const STEPS = [
  { id: 1, title: "Estructura" },
  { id: 2, title: "Planos" },
  { id: 3, title: "Directorio" },
  { id: 4, title: "Equipos" },
];

export function CargaInicialWizard({ structure }: { structure: WizardStructure }) {
  const [step, setStep] = useState(1);
  const [assignments, setAssignments] = useState<PlanAssignment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [planMessage, setPlanMessage] = useState<string | null>(null);

  const allFloors = structure.buildings.flatMap((b) =>
    b.floors.map((f) => ({ id: f.id, label: `${b.name} / ${f.name}` })),
  );

  function stepState(id: number): string {
    if (id === 1) return structure.counts.buildings > 0 ? "hecho" : "pendiente";
    if (id === 2) return structure.counts.floorsWithPlan > 0 ? "hecho" : "pendiente";
    if (id === 3) return structure.counts.directory > 0 ? "hecho" : "opcional";
    return structure.counts.computers > 0 ? "hecho" : "pendiente";
  }

  function addFiles(files: FileList) {
    const next: PlanAssignment[] = [];
    for (const file of Array.from(files)) {
      const base = file.name.replace(/\.[^.]+$/, "");
      const [edificioRaw, plantaRaw] = base.split("__");
      let floorId = "";
      let matched = false;
      if (edificioRaw && plantaRaw) {
        const building = structure.buildings.find((b) => normKey(b.code) === normKey(edificioRaw));
        const floor = building?.floors.find((f) => normKey(f.name) === normKey(plantaRaw));
        if (floor) {
          floorId = floor.id;
          matched = true;
        }
      }
      next.push({ file, floorId, matched, status: matched ? "asignado automáticamente" : "pendiente de asignar" });
    }
    setAssignments((prev) => [...prev, ...next]);
  }

  async function uploadPlans() {
    setUploading(true);
    setPlanMessage(null);
    const results: string[] = [];
    for (const assignment of assignments) {
      if (!assignment.floorId) {
        results.push(`${assignment.file.name}: sin asignar`);
        continue;
      }
      let formData = new FormData();
      formData.append("file", assignment.file);
      let res = await fetch(`/api/floors/${assignment.floorId}/plan`, { method: "POST", body: formData });
      let data = await res.json();
      if (res.status === 409 && data?.error?.code === "ASPECT_CHANGED") {
        if (window.confirm(`${assignment.file.name}: ${data.error.message}\n\n¿Continuar?`)) {
          formData = new FormData();
          formData.append("file", assignment.file);
          formData.append("confirmAspect", "true");
          res = await fetch(`/api/floors/${assignment.floorId}/plan`, { method: "POST", body: formData });
          data = await res.json();
        }
      }
      results.push(
        res.ok
          ? `${assignment.file.name}: ${data.width}×${data.height}${data.aspectChanged ? " (proporción cambiada)" : ""}`
          : `${assignment.file.name}: ${data?.error?.message ?? "error"}`,
      );
    }
    setPlanMessage(results.join("\n"));
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setStep(s.id)}
              className={`rounded-full border px-4 py-1.5 text-sm ${
                step === s.id ? "border-primary bg-primary text-primary-foreground" : "bg-background"
              }`}
            >
              {s.id}. {s.title}{" "}
              <Badge variant={stepState(s.id) === "hecho" ? "default" : "secondary"} className="ml-1">
                {stepState(s.id)}
              </Badge>
            </button>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Sube el <code>estructura.csv</code> (edificios, plantas, departamentos y despachos con su
            rectángulo). Se previsualiza antes de confirmar y nunca se borra nada.
          </p>
          <ImportTab kind="structure" />
        </div>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Planos por planta</CardTitle>
            <CardDescription>
              Selecciona los SVG/PNG/JPG/WebP. El nombre <code>EDIFICIO__PLANTA.ext</code> permite
              asignarlos automáticamente (p. ej. <code>AYTO__PLANTA-BAJA.svg</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
              Elegir planos
              <input
                type="file"
                multiple
                accept=".svg,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </label>
            {assignments.map((assignment, index) => (
              <div key={`${assignment.file.name}-${index}`} className="flex items-center gap-2 text-sm">
                <span className="w-64 truncate">{assignment.file.name}</span>
                <Select
                  value={assignment.floorId}
                  onChange={(e) => {
                    const floorId = e.target.value;
                    setAssignments((prev) =>
                      prev.map((a, i) =>
                        i === index ? { ...a, floorId, matched: false, status: floorId ? "asignado a mano" : "pendiente de asignar" } : a,
                      ),
                    );
                  }}
                >
                  <option value="">— asignar planta —</option>
                  {allFloors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-muted-foreground">{assignment.status}</span>
              </div>
            ))}
            <Button onClick={uploadPlans} disabled={uploading || assignments.length === 0}>
              Subir {assignments.length} plano(s)
            </Button>
            {planMessage ? <pre className="whitespace-pre-wrap text-xs">{planMessage}</pre> : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Directorio de usuarios (opcional)</CardTitle>
            <CardDescription>
              La importación de <code>ad-usuarios.csv</code> (RF-17) se implementa en la tarea T-59 de
              la fase F8. Puedes saltarte este paso.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {step === 4 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Sube el <code>equipos.csv</code>. Los equipos desconocidos se crean con <code>source=CSV</code>;
            reimportar el mismo fichero no produce cambios.
          </p>
          <ImportTab kind="computers" />
          <div className="flex gap-3 pt-2">
            <Link href="/mapa" className="text-sm text-primary underline-offset-2 hover:underline">
              Ir al mapa →
            </Link>
            <Link href="/calidad" className="text-sm text-primary underline-offset-2 hover:underline">
              Ver calidad de datos →
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 1} onClick={() => setStep(step - 1)}>
          Anterior
        </Button>
        <Button variant="outline" disabled={step === 4} onClick={() => setStep(step + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
