import { ImportPanel } from "@/components/import/import-panel";

export const dynamic = "force-dynamic";

export default function ImportarPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Importar / Exportar</h1>
      <ImportPanel />
    </div>
  );
}
