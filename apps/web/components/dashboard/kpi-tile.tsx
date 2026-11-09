import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiTone = "green" | "red" | "teal" | "blue" | "amber" | "slate";

const TONES: Record<KpiTone, string> = {
  green: "bg-[#2fa84f] text-white",
  red: "bg-[#c0392b] text-white",
  teal: "bg-[#12899a] text-white",
  blue: "bg-[#2e4f8f] text-white",
  amber: "bg-[#f39a1f] text-white",
  slate: "bg-[#8a8f98] text-white",
};

/** Teselas de color al estilo del panel de GLPI (specs/11 §12). */
export function KpiTile({
  label, value, href, icon: Icon, tone = "teal",
}: { label: string; value: number; href: string; icon: LucideIcon; tone?: KpiTone }) {
  return (
    <Link
      href={href}
      className={cn("relative flex h-24 flex-col justify-between rounded-sm p-3 shadow-sm transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2", TONES[tone])}
    >
      <Icon className="absolute right-3 top-3 h-6 w-6 opacity-80" aria-hidden />
      <span className="text-3xl font-light leading-none">{value}</span>
      <span className="text-sm opacity-90">{label}</span>
    </Link>
  );
}
