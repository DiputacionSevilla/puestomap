import { LogOut } from "lucide-react";
import type { AppRole } from "@/types/next-auth";
import { GlobalSearch } from "./global-search";
import { logout } from "@/app/(app)/actions";
import { formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";

export function Header({
  user,
  lastOcsSync,
  lastProbe,
}: {
  user: { name: string; role: AppRole };
  lastOcsSync: Date | null;
  lastProbe: Date | null;
}) {
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
      <GlobalSearch />
      <div className="ml-auto hidden items-center gap-3 text-xs text-muted-foreground lg:flex">
        <span title="Última sincronización con OCS">
          GLPI: {formatRelative(lastOcsSync)}
        </span>
        <span title="Último sondeo de red">Sondeo: {formatRelative(lastProbe)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium leading-tight">{user.name}</div>
          <div className="text-xs text-muted-foreground leading-tight">{user.role}</div>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="icon" title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Cerrar sesión</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
