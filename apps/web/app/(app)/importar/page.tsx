import Link from "next/link";
import { ImportPanel } from "@/components/import/import-panel";

export const dynamic = "force-dynamic";

export default function ImportarPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Importar / Exportar</h1>
        <Link
          href="/importar/carga-inicial"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Asistente de carga inicial
        </Link>
      </div>
      <ImportPanel />
    </div>
  );
}
