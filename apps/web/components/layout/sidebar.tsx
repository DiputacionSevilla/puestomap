"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  HelpCircle,
  Home,
  Monitor,
  ScrollText,
  ScreenShare,
  Settings,
  Upload,
  Map as MapIcon,
  ShieldCheck,
} from "lucide-react";
import type { AppRole } from "@/types/next-auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/equipos", label: "Equipos", icon: Monitor },
  { href: "/mapa", label: "Mapa", icon: MapIcon },
  { href: "/calidad", label: "Calidad", icon: ShieldCheck, techOnly: true },
  { href: "/sesiones", label: "Sesiones", icon: ScreenShare },
  { href: "/estructura", label: "Estructura", icon: Building2 },
  { href: "/importar", label: "Importar/Exportar", icon: Upload },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
  { href: "/auditoria", label: "Auditoría", icon: ScrollText, adminOnly: true },
  { href: "/ayuda/tightvnc", label: "Ayuda TightVNC", icon: HelpCircle },
];

export function Sidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-muted/30 md:flex">
      <div className="flex h-14 items-center border-b px-4 font-semibold tracking-tight">
        PuestoMap
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV.filter((item) =>
          (!("adminOnly" in item) || !item.adminOnly || role === "ADMIN") &&
          (!("techOnly" in item) || !item.techOnly || role !== "VIEWER"),
        ).map(
          (item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          },
        )}
      </nav>
    </aside>
  );
}
