"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Download, Filter, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Checkbox, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StateBadge } from "@/components/state-badge";
import { ComputerActions } from "./computer-actions";
import { formatRelative } from "@/lib/format";
import type { VncUiState } from "@puestomap/shared";

type StructureOption = {
  buildings: { id: string; name: string; floors: { id: string; name: string }[] }[];
  departments: { id: string; name: string }[];
  offices: { id: string; code: string; name: string; floorId: string }[];
  credentials: { id: string; name: string }[];
};

type ListItem = {
  id: string;
  hostname: string;
  ip: string | null;
  lastUser: string | null;
  assignedTo: string | null;
  os: string | null;
  building: string | null;
  floor: string | null;
  floorId: string | null;
  office: string | null;
  department: string | null;
  lastProbeAt: string | null;
  state: VncUiState;
  multiState: "SINGLE" | "MULTI_OK" | "MULTI_PENDING";
  monitorCount: number | null;
  archived: boolean;
};

const STATE_OPTIONS: { value: VncUiState; label: string }[] = [
  { value: "READY", label: "Listo" },
  { value: "NOT_LISTENING", label: "Sin VNC" },
  { value: "NOT_INSTALLED", label: "Sin instalar" },
  { value: "OFFLINE", label: "Apagado" },
  { value: "UNKNOWN", label: "Desconocido" },
];

export function ComputersExplorer({
  structure,
  canAssist,
  canBulk,
}: {
  structure: StructureOption;
  canAssist: boolean;
  canBulk: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCredential, setBulkCredential] = useState("");
  const [bulkDepartment, setBulkDepartment] = useState("");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const params = useMemo(() => {
    const obj: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (value) obj[key] = value;
    });
    return obj;
  }, [searchParams]);

  const page = Number(params.page ?? 1) || 1;
  const pageSize = 50;

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in patch)) next.delete("page");
      router.replace(`/equipos?${next.toString()}`);
    },
    [params, router],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const qs = new URLSearchParams({ ...params, page: String(page), pageSize: String(pageSize) });
    fetch(`/api/computers?${qs.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { items: [], total: 0 }))
      .then((data: { items: ListItem[]; total: number }) => {
        setItems(data.items);
        setTotal(data.total);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => controller.abort();
  }, [params, page]);

  const floorsOfBuilding = useMemo(() => {
    const building = structure.buildings.find((b) => b.id === params.buildingId);
    return building?.floors ?? [];
  }, [structure.buildings, params.buildingId]);

  const officesOfFloor = useMemo(
    () => structure.offices.filter((o) => !params.floorId || o.floorId === params.floorId),
    [structure.offices, params.floorId],
  );

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function toggleSort(field: string) {
    const dir = params.sort === field && params.dir !== "desc" ? "desc" : "asc";
    setParams({ sort: field, dir });
  }

  function toggleState(state: VncUiState) {
    const current = (params.state ?? "").split(",").filter(Boolean);
    const next = current.includes(state) ? current.filter((s) => s !== state) : [...current, state];
    setParams({ state: next.join(",") });
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  }

  async function applyBulk() {
    const res = await fetch("/api/computers/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: Array.from(selected),
        set: {
          credentialId: bulkCredential || null,
          departmentId: bulkDepartment || null,
        },
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setBulkMessage(`Actualizados ${data.updated} equipos.`);
      setBulkOpen(false);
      setSelected(new Set());
      setParams({ refresh: String(Date.now()) });
    } else {
      setBulkMessage(data?.error?.message ?? "Error al actualizar.");
    }
  }

  const sortIcon = (field: string) => {
    if (params.sort !== field) return <ChevronsUpDown className="inline h-3 w-3" />;
    return params.dir === "desc" ? (
      <ChevronDown className="inline h-3 w-3" />
    ) : (
      <ChevronUp className="inline h-3 w-3" />
    );
  };

  return (
    <div className="flex gap-4">
      {showFilters ? (
        <Card className="w-64 shrink-0 self-start">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              Filtros
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)}>
                Ocultar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <Label htmlFor="q">Búsqueda</Label>
              <Input
                id="q"
                defaultValue={params.q ?? ""}
                placeholder="hostname, IP, usuario, serial…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setParams({ q: (e.target as HTMLInputElement).value });
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="buildingId">Edificio</Label>
              <Select
                id="buildingId"
                value={params.buildingId ?? ""}
                onChange={(e) => setParams({ buildingId: e.target.value, floorId: null })}
              >
                <option value="">Todos</option>
                {structure.buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="floorId">Planta</Label>
              <Select
                id="floorId"
                value={params.floorId ?? ""}
                onChange={(e) => setParams({ floorId: e.target.value })}
                disabled={!params.buildingId}
              >
                <option value="">Todas</option>
                {floorsOfBuilding.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="departmentId">Departamento</Label>
              <Select
                id="departmentId"
                value={params.departmentId ?? ""}
                onChange={(e) => setParams({ departmentId: e.target.value })}
              >
                <option value="">Todos</option>
                {structure.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="officeId">Despacho</Label>
              <Select
                id="officeId"
                value={params.officeId ?? ""}
                onChange={(e) => setParams({ officeId: e.target.value })}
              >
                <option value="">Todos</option>
                {officesOfFloor.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {o.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Estado VNC</Label>
              <div className="mt-1 space-y-1">
                {STATE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2">
                    <Checkbox
                      checked={(params.state ?? "").split(",").includes(opt.value)}
                      onChange={() => toggleState(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="os">Sistema operativo</Label>
              <Input
                id="os"
                defaultValue={params.os ?? ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setParams({ os: (e.target as HTMLInputElement).value });
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={params.unplaced === "true"}
                  onChange={(e) => setParams({ unplaced: e.target.checked ? "true" : null })}
                />
                Sin ubicar
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={params.staleOcs === "true"}
                  onChange={(e) => setParams({ staleOcs: e.target.checked ? "true" : null })}
                />
                No visto en OCS &gt; 30 días
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={params.multiPending === "true"}
                  onChange={(e) => setParams({ multiPending: e.target.checked ? "true" : null })}
                />
                Multipantalla pendiente
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={params.archived === "true"}
                  onChange={(e) => setParams({ archived: e.target.checked ? "true" : null })}
                />
                Mostrar archivados
              </label>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => router.replace("/equipos")}>
              Limpiar filtros
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowFilters(true)}>
          <Filter className="h-4 w-4" />
          Filtros
        </Button>
      )}

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {loading ? "Cargando…" : `${total} equipos`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {canBulk && selected.size > 0 ? (
              <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
                Asignar a {selected.size} seleccionados
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const qs = new URLSearchParams(params);
                window.open(`/api/computers/export.csv?${qs.toString()}`, "_blank");
              }}
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {bulkMessage ? <p className="text-sm text-green-600">{bulkMessage}</p> : null}

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {canBulk ? <TableHead className="w-8" /> : null}
                <TableHead className="w-10">Estado</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("hostname")}>
                    Hostname {sortIcon("hostname")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("ip")}>
                    IP {sortIcon("ip")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("lastUser")}>
                    Último usuario {sortIcon("lastUser")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("assignedTo")}>
                    Asignado a {sortIcon("assignedTo")}
                  </button>
                </TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("os")}>
                    SO {sortIcon("os")}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("lastProbeAt")}>
                    Último sondeo {sortIcon("lastProbeAt")}
                  </button>
                </TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  {canBulk ? (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <StateBadge state={item.state} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/equipos/${item.id}`} className="font-medium text-primary hover:underline">
                      {item.hostname}
                    </Link>
                    {item.multiState !== "SINGLE" ? (
                      <span className="ml-1 text-xs text-muted-foreground" title="Equipo con varias pantallas">
                        ▭▭
                      </span>
                    ) : null}
                    {item.archived ? (
                      <span className="ml-1 rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
                        archivado
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{item.ip ?? "—"}</TableCell>
                  <TableCell>{item.lastUser ?? "—"}</TableCell>
                  <TableCell>{item.assignedTo ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {[item.building, item.floor, item.office].filter(Boolean).join(" / ") || "Sin ubicar"}
                  </TableCell>
                  <TableCell>{item.department ?? "—"}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{item.os ?? "—"}</TableCell>
                  <TableCell>{formatRelative(item.lastProbeAt)}</TableCell>
                  <TableCell>
                    <ComputerActions
                      computer={{ id: item.id, hostname: item.hostname, ip: item.ip, placed: Boolean(item.floorId) }}
                      canAssist={canAssist}
                      compact
                    />
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    No hay equipos que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span>
            Página {page} de {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1) })}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setParams({ page: String(page + 1) })}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignación masiva ({selected.size} equipos)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="bulk-credential">Credencial VNC</Label>
              <Select
                id="bulk-credential"
                value={bulkCredential}
                onChange={(e) => setBulkCredential(e.target.value)}
              >
                <option value="">Sin cambios</option>
                {structure.credentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="bulk-department">Departamento</Label>
              <Select
                id="bulk-department"
                value={bulkDepartment}
                onChange={(e) => setBulkDepartment(e.target.value)}
              >
                <option value="">Sin cambios</option>
                {structure.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={applyBulk}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
