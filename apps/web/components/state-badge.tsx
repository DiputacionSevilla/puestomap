import type { VncUiState } from "@puestomap/shared";
import { cn } from "@/lib/utils";

export const VNC_STATE_META: Record<
  VncUiState,
  { label: string; shape: string; textClass: string; bgClass: string }
> = {
  READY: { label: "Listo", shape: "●", textClass: "text-green-600", bgClass: "bg-green-600" },
  NOT_LISTENING: { label: "Sin VNC", shape: "▲", textClass: "text-amber-500", bgClass: "bg-amber-500" },
  NOT_INSTALLED: { label: "Sin instalar", shape: "✕", textClass: "text-red-600", bgClass: "bg-red-600" },
  OFFLINE: { label: "Apagado", shape: "○", textClass: "text-gray-500", bgClass: "bg-gray-500" },
  UNKNOWN: { label: "Desconocido", shape: "◌", textClass: "text-gray-400", bgClass: "bg-gray-400" },
};

export function StateBadge({
  state,
  className,
}: {
  state: VncUiState;
  className?: string;
}) {
  const meta = VNC_STATE_META[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium", meta.textClass, className)}
      title={meta.label}
    >
      <span aria-hidden>{meta.shape}</span>
      <span className="sr-only">{meta.label}</span>
      <span className="hidden sm:inline">{meta.label}</span>
    </span>
  );
}

export function StateDot({ state }: { state: VncUiState }) {
  const meta = VNC_STATE_META[state];
  return (
    <span className={cn("inline-block h-3 w-3 rounded-full", meta.bgClass)} title={meta.label}>
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}
