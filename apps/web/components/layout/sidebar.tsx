"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Building2,
  ChevronsLeft,
  ChevronsRight,
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
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("pm-sidebar") === "collapsed");
    } catch {
      // sin almacenamiento: menú desplegado
    }
  }, []);
  function toggle() {
    setCollapsed((value) => {
      try {
        window.localStorage.setItem("pm-sidebar", value ? "open" : "collapsed");
      } catch {
        // ignorar
      }
      return !value;
    });
  }
  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-[width] md:flex",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="flex h-14 items-center px-4 text-lg font-semibold tracking-tight">
        {collapsed ? "PM" : "PuestoMap"}
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
                  "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[hsl(var(--sidebar-active))]"
                    : "text-white/85 hover:bg-white/10 hover:text-white",
                )}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
              </Link>
            );
          },
        )}
      </nav>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 px-4 py-3 text-sm text-white/85 hover:text-white"
        aria-label={collapsed ? "Desplegar menú" : "Plegar menú"}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Plegar menú</>}
      </button>
    </aside>
  );
}
