"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { findOfficeAt, fromLatLng, toLatLng, type VncUiState } from "@puestomap/shared";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StateBadge } from "@/components/state-badge";
import { ComputerActions } from "@/components/computers/computer-actions";
import { cn } from "@/lib/utils";

export type MapComputer = {
  id: string;
  hostname: string;
  ip: string | null;
  lastUser: string | null;
  lastUserNorm: string | null;
  adUsername: string | null;
  assignedTo: string | null;
  posX: number | null;
  posY: number | null;
  state: VncUiState;
  userMatch: string;
  directoryName: string | null;
  monitorCount: number | null;
  screens: { index: number; label: string; port: number; enabled: boolean }[];
  officeId: string | null;
  departmentId: string | null;
};

export type MapOffice = {
  id: string;
  code: string;
  name: string;
  departmentId: string | null;
  rect: { x: number; y: number; w: number; h: number } | null;
  computerCount: number;
};

export type MapDepartment = { id: string; name: string };

type Props = {
  floorId: string;
  floorName: string;
  buildingName: string;
  planWidth: number;
  planHeight: number;
  planUrl: string | null;
  initialComputers: MapComputer[];
  offices: MapOffice[];
  departments: MapDepartment[];
  canEdit: boolean;
  focusId?: string | null;
  unplaced: MapComputer[];
  glpiWriteback?: boolean;
};

const STATE_COLORS: Record<VncUiState, { fill: string; border: string; shape: string }> = {
  READY: { fill: "#16a34a", border: "#166534", shape: "circle" },
  NOT_LISTENING: { fill: "#f59e0b", border: "#b45309", shape: "triangle" },
  NOT_INSTALLED: { fill: "#dc2626", border: "#7f1d1d", shape: "cross" },
  OFFLINE: { fill: "#6b7280", border: "#374151", shape: "ring" },
  UNKNOWN: { fill: "#d1d5db", border: "#9ca3af", shape: "dashed" },
};

type LabelMode = "hostname" | "assignedTo" | "adUsername";

function markerHtml(state: VncUiState, label: string, dimmed: boolean, multi: boolean): string {
  const colors = STATE_COLORS[state];
  const labelHtml = label
    ? `<span class="pm-marker-label">${label}</span>`
    : "";
  return `<div class="pm-marker ${dimmed ? "pm-marker-dim" : ""}" data-shape="${colors.shape}" style="--pm-fill:${colors.fill};--pm-border:${colors.border}">${multi ? '<span class="pm-marker-multi">▭▭</span>' : ""}${labelHtml}</div>`;
}

export function FloorMap({
  floorId,
  floorName,
  buildingName,
  planWidth,
  planHeight,
  planUrl,
  initialComputers,
  offices,
  departments,
  canEdit,
  focusId,
  unplaced: initialUnplaced,
  glpiWriteback = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const officeLayersRef = useRef<L.LayerGroup | null>(null);
  const placeRef = useRef<
    (computerId: string, pos: { posX: number; posY: number }) => Promise<void>
  >(async () => undefined);

  const [computers, setComputers] = useState<MapComputer[]>(initialComputers);
  const [selected, setSelected] = useState<MapComputer | null>(null);
  const [labelMode, setLabelMode] = useState<LabelMode>(() => {
    if (typeof window === "undefined") return "hostname";
    return (window.localStorage.getItem("pm-map-label") as LabelMode) || "hostname";
  });
  const [showOffices, setShowOffices] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [unplaced, setUnplaced] = useState<MapComputer[]>(initialUnplaced);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(0);

  const dimmed = useCallback(
    (computer: MapComputer) =>
      departmentFilter !== "" && computer.departmentId !== departmentFilter,
    [departmentFilter],
  );

  const labelFor = useCallback(
    (computer: MapComputer) => {
      if (labelMode === "assignedTo") return computer.assignedTo ?? "";
      if (labelMode === "adUsername") return computer.adUsername ?? "";
      return computer.hostname;
    },
    [labelMode],
  );

  useEffect(() => {
    window.localStorage.setItem("pm-map-label", labelMode);
  }, [labelMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -3,
      maxZoom: 2,
      zoomSnap: 0.5,
    });
    mapRef.current = map;

    const bounds = L.latLngBounds([0, 0], [planHeight, planWidth]);
    if (planUrl) {
      L.imageOverlay(planUrl, bounds, { interactive: false }).addTo(map);
    }
    map.fitBounds(bounds);
    map.setMaxBounds(bounds.pad(0.1));

    map.on("zoomend", () => setZoom(map.getZoom()));
    setZoom(map.getZoom());

    const container = containerRef.current;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const computerId = e.dataTransfer?.getData("text/plain");
      if (!computerId || !mapRef.current) return;
      const latlng = mapRef.current.mouseEventToLatLng(e as unknown as MouseEvent);
      const pos = fromLatLng(latlng.lat, latlng.lng, { planWidth, planHeight });
      void placeRef.current(computerId, pos);
    };
    container.addEventListener("dragover", onDragOver);
    container.addEventListener("drop", onDrop);

    officeLayersRef.current = L.layerGroup().addTo(map);
    return () => {
      container.removeEventListener("dragover", onDragOver);
      container.removeEventListener("drop", onDrop);
      map.remove();
      mapRef.current = null;
    };
  }, [planUrl, planWidth, planHeight]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !officeLayersRef.current) return;
    officeLayersRef.current.clearLayers();
    if (!showOffices) return;
    for (const office of offices) {
      if (!office.rect) continue;
      const topLeft = toLatLng(office.rect.x, office.rect.y, { planWidth, planHeight });
      const bottomRight = toLatLng(
        office.rect.x + office.rect.w,
        office.rect.y + office.rect.h,
        { planWidth, planHeight },
      );
      const rect = L.rectangle(L.latLngBounds(topLeft, bottomRight), {
        color: "#4f46e5",
        weight: 1.5,
        fillOpacity: 0.05,
        dashArray: "4 3",
      });
      rect.bindTooltip(`${office.code} · ${office.name} (${office.computerCount})`, {
        sticky: true,
        direction: "top",
      });
      rect.on("click", () => {
        map.fitBounds(L.latLngBounds(topLeft, bottomRight).pad(0.2));
      });
      rect.addTo(officeLayersRef.current);
    }
  }, [offices, showOffices, planWidth, planHeight]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draggable = canEdit && editMode;
    for (const [id, marker] of markersRef.current) {
      if (!computers.some((c) => c.id === id) || marker.options.draggable !== draggable) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
    const showLabels = zoom > map.getMinZoom() + 1.5;
    for (const computer of computers) {
      const pos = computer.posX != null && computer.posY != null
        ? toLatLng(computer.posX, computer.posY, { planWidth, planHeight })
        : null;
      if (!pos) continue;
      const icon = L.divIcon({
        className: "",
        html: markerHtml(
          computer.state,
          showLabels ? labelFor(computer) : "",
          dimmed(computer),
          computer.screens.length >= 2 || (computer.monitorCount ?? 0) > 1,
        ),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      let marker = markersRef.current.get(computer.id);
      if (!marker) {
        marker = L.marker([pos.lat, pos.lng], { icon, draggable });
        marker.addTo(map);
        markersRef.current.set(computer.id, marker);
        marker.on("click", () => setSelected(computer));
        if (canEdit) {
          marker.on("dragend", () => {
            const ll = marker?.getLatLng();
            if (!ll) return;
            const pos2 = fromLatLng(ll.lat, ll.lng, { planWidth, planHeight });
            void placeRef.current(computer.id, pos2);
          });
        }
        marker.bindTooltip(
          `<b>${computer.hostname}</b><br/>${computer.assignedTo ?? "sin asignar"} · ${
            computer.adUsername ?? "sin usuario AD"
          }<br/>${computer.ip ?? "sin IP"} · ${computer.state}`,
          { direction: "top" },
        );
      } else {
        marker.setLatLng([pos.lat, pos.lng]);
        marker.setIcon(icon);
        marker.setTooltipContent(
          `<b>${computer.hostname}</b><br/>${computer.assignedTo ?? "sin asignar"} · ${
            computer.adUsername ?? "sin usuario AD"
          }<br/>${computer.ip ?? "sin IP"} · ${computer.state}`,
        );
      }
    }
  }, [computers, zoom, labelMode, labelFor, dimmed, canEdit, editMode, planWidth, planHeight]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusId) return;
    const computer = computers.find((c) => c.id === focusId);
    if (!computer || computer.posX == null || computer.posY == null) return;
    const pos = toLatLng(computer.posX, computer.posY, { planWidth, planHeight });
    map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 0), { duration: 0.8 });
    const ring = L.circleMarker([pos.lat, pos.lng], {
      radius: 22,
      color: "#2563eb",
      weight: 3,
      fillOpacity: 0,
      className: "pm-focus-ring",
    }).addTo(map);
    setTimeout(() => ring.remove(), 3000);
  }, [focusId, computers, planWidth, planHeight]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetch(`/api/floors/${floorId}/computers`)
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data: { items: MapComputer[] }) => {
          setComputers(data.items);
          setSelected((prev) =>
            prev ? (data.items.find((c) => c.id === prev.id) ?? prev) : null,
          );
        })
        .catch(() => undefined);
    }, 60000);
    return () => clearInterval(timer);
  }, [floorId]);

  const placeComputer = useCallback(
    async (
      computerId: string,
      pos: { posX: number; posY: number },
    ) => {
      const target = computers.find((c) => c.id === computerId);
      if (!target) return;
      const officeId = findOfficeAt(
        offices.map((o) => ({ id: o.id, rect: o.rect })),
        pos.posX,
        pos.posY,
      );
      const previousOffice = target.officeId;
      const officeChanged = officeId !== null && officeId !== previousOffice;
      const sendToGlpi = glpiWriteback && officeChanged &&
        window.confirm("Se actualizará también el lugar en GLPI. ¿Continuar?");
      const res = await fetch(`/api/computers/${computerId}/position`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          floorId, posX: pos.posX, posY: pos.posY, officeId,
          ...(sendToGlpi ? { glpiWriteback: true } : {}),
        }),
      });
      if (!res.ok) return;
      setComputers((prev) =>
        prev.map((c) =>
          c.id === computerId
            ? { ...c, posX: pos.posX, posY: pos.posY, officeId: officeId ?? null }
            : c,
        ),
      );
      setUnplaced((prev) => prev.filter((c) => c.id !== computerId));
      const office = offices.find((o) => o.id === officeId);
      if (office && officeId !== previousOffice) {
        setToast({
          text: `${target.hostname} → despacho ${office.code}`,
          undo: () => {
            void fetch(`/api/computers/${computerId}/position`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                floorId,
                posX: pos.posX,
                posY: pos.posY,
                officeId: previousOffice,
              }),
            });
            setComputers((prev) =>
              prev.map((c) =>
                c.id === computerId ? { ...c, officeId: previousOffice } : c,
              ),
            );
            setToast(null);
          },
        });
        setTimeout(() => setToast(null), 8000);
      }
    },
    [computers, offices, floorId, glpiWriteback],
  );

  useEffect(() => {
    placeRef.current = placeComputer;
  }, [placeComputer]);

  const counters = useMemo(() => {
    const acc: Record<VncUiState, number> = {
      READY: 0,
      NOT_LISTENING: 0,
      NOT_INSTALLED: 0,
      OFFLINE: 0,
      UNKNOWN: 0,
    };
    for (const c of computers) acc[c.state] += 1;
    return acc;
  }, [computers]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return computers
      .filter(
        (c) =>
          c.hostname.toLowerCase().includes(q) ||
          (c.ip ?? "").includes(q) ||
          (c.assignedTo ?? "").toLowerCase().includes(q) ||
          (c.adUsername ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [computers, search]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en la planta…"
            className="h-8 w-56 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {searchResults.length > 0 ? (
            <div className="absolute z-[500] mt-9 w-56 rounded-md border bg-background shadow-lg">
              {searchResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setSelected(c);
                    setSearch("");
                  }}
                >
                  {c.hostname}
                </button>
              ))}
            </div>
          ) : null}
          <Select
            value={labelMode}
            onChange={(e) => setLabelMode(e.target.value as LabelMode)}
            className="h-8 w-44 text-sm"
            title="Etiqueta del marcador"
          >
            <option value="hostname">Etiqueta: hostname</option>
            <option value="assignedTo">Etiqueta: asignado a</option>
            <option value="adUsername">Etiqueta: usuario de dominio</option>
          </Select>
          <Select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="h-8 w-44 text-sm"
            title="Filtrar por departamento (atenúa el resto)"
          >
            <option value="">Todos los departamentos</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={showOffices}
              onChange={(e) => setShowOffices(e.target.checked)}
            />
            Capa despachos
          </label>
          {canEdit ? (
            <Button
              size="sm"
              variant={editMode ? "default" : "outline"}
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? "Salir de edición" : "Modo edición"}
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {buildingName} · {floorName}
            </span>
            <span>·</span>
            <span>{computers.length} equipos</span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border">
          <div ref={containerRef} className="h-full w-full bg-muted/30" />
          {planUrl ? null : (
            <div className="absolute inset-0 z-[400] flex items-center justify-center bg-background/80">
              <p className="text-sm text-muted-foreground">
                Esta planta no tiene plano asignado. Súbelo en Estructura (ADMIN).
              </p>
            </div>
          )}
          {editMode ? (
            <div className="absolute bottom-2 left-2 z-[450] rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground">
              Arrastra los marcadores o pulsa sobre el plano para ubicar el equipo seleccionado.
            </div>
          ) : null}
          {toast ? (
            <div className="absolute bottom-2 right-2 z-[450] flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-lg">
              {toast.text}
              {toast.undo ? (
                <Button size="sm" variant="outline" onClick={toast.undo}>
                  Deshacer
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {(Object.keys(STATE_COLORS) as VncUiState[]).map((state) => (
            <span key={state} className="flex items-center gap-1">
              <StateBadge state={state} />
              <b>{counters[state]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">
        {selected ? (
          <div className="rounded-lg border bg-card p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold">{selected.hostname}</span>
              <StateBadge state={selected.state} />
            </div>
            <p className="text-xs text-muted-foreground">
              {selected.ip ?? "sin IP"} · {selected.assignedTo ?? "sin asignar"}
              <br />
              {selected.adUsername
                ? `${selected.adUsername}${selected.directoryName ? ` (${selected.directoryName})` : ""}`
                : "sin usuario de dominio"}
              {selected.userMatch === "MISMATCH" ? (
                <Badge variant="destructive" className="ml-1 text-[10px]">
                  discrepancia con OCS
                </Badge>
              ) : null}
            </p>
            <div className="mt-2">
              <ComputerActions
                computer={{
                  id: selected.id,
                  hostname: selected.hostname,
                  ip: selected.ip,
                  placed: true,
                  screens: selected.screens,
                  multiState: selected.screens.length >= 2 ? "MULTI_OK" : (selected.monitorCount ?? 0) > 1 ? "MULTI_PENDING" : "SINGLE",
                }}
                compact
              />
            </div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setSelected(null)}>
              Cerrar
            </Button>
          </div>
        ) : null}

        <div className="rounded-lg border bg-card p-3">
          <h3 className="mb-2 text-sm font-semibold">Despachos de la planta</h3>
          <ul className="space-y-1 text-sm">
            {offices.map((office) => (
              <li key={office.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded px-1 py-0.5 hover:bg-accent"
                  onClick={() => {
                    const map = mapRef.current;
                    if (!map || !office.rect) return;
                    const a = toLatLng(office.rect.x, office.rect.y, { planWidth, planHeight });
                    const b = toLatLng(office.rect.x + office.rect.w, office.rect.y + office.rect.h, {
                      planWidth,
                      planHeight,
                    });
                    map.fitBounds(L.latLngBounds(a, b).pad(0.2));
                  }}
                >
                  <span className="truncate">
                    {office.code} · {office.name}
                  </span>
                  <Badge variant="secondary">{office.computerCount}</Badge>
                </button>
              </li>
            ))}
            {offices.length === 0 ? (
              <li className="text-xs text-muted-foreground">Sin despachos definidos.</li>
            ) : null}
          </ul>
        </div>

        {canEdit ? (
          <div className="rounded-lg border bg-card p-3">
            <h3 className="mb-2 text-sm font-semibold">
              Sin colocar ({unplaced.length})
            </h3>
            <ul className="space-y-1 text-sm">
              {unplaced.map((computer) => (
                <li
                  key={computer.id}
                  draggable
                  onDragEnd={() => undefined}
                  className={cn(
                    "cursor-grab rounded border px-2 py-1",
                    editMode ? "border-dashed" : "opacity-60",
                  )}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", computer.id);
                  }}
                >
                  {computer.hostname}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {computer.assignedTo ?? ""}
                  </span>
                </li>
              ))}
              {unplaced.length === 0 ? (
                <li className="text-xs text-muted-foreground">Todos los equipos están ubicados.</li>
              ) : null}
            </ul>
            {editMode ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Arrastra un equipo al plano para ubicarlo. Al soltarlo dentro de un despacho se
                asigna automáticamente.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
