"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Plus, RefreshCw, ScanSearch, Trash2, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";
import { StateBadge } from "@/components/state-badge";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";

type ComputerData = {
  id: string;
  hostname: string;
  ocsId: number | null;
  glpiId?: number | null;
  externalRef: string | null;
  assetTag: string | null;
  serial: string | null;
  source: string;
  archived: boolean;
  ip: string | null;
  mac: string | null;
  domain: string | null;
  manufacturer: string | null;
  model: string | null;
  os: string | null;
  osVersion: string | null;
  cpu: string | null;
  ramMb: number | null;
  diskGb: number | null;
  lastUser: string | null;
  lastUserNorm: string | null;
  adUsername: string | null;
  directoryUser: { displayName: string; department: string | null; phone: string | null } | null;
  lastUserDirectoryName: string | null;
  ocsLastInventory: string | null;
  assignedTo: string | null;
  phoneExt: string | null;
  notes: string | null;
  floorId: string | null;
  officeId: string | null;
  departmentId: string | null;
  posX: number | null;
  posY: number | null;
  vncInstalled: string;
  vncInstalledSrc: string | null;
  vncVersion: string | null;
  vncPort: number;
  vncOverride: string | null;
  credentialId: string | null;
  online: boolean | null;
  vncReachable: boolean | null;
  rfbVersion: string | null;
  lastProbeAt: string | null;
  lastSeenAt: string | null;
  lastVncOkAt: string | null;
  monitorCount: number | null;
  createdAt: string;
  updatedAt: string;
  floor: { id: string; name: string; building: { id: string; code: string; name: string } } | null;
  office: { id: string; code: string; name: string } | null;
  department: { id: string; code: string; name: string } | null;
  credential: { id: string; name: string; isDefault: boolean } | null;
  screens: { id: string; index: number; label: string; port: number; enabled: boolean; source: string; reachable: boolean | null; lastProbeAt: string | null; lastOkAt: string | null }[];
};

type SessionRow = {
  id: string;
  mode: string;
  status: string;
  reason: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  bytesIn: string;
  bytesOut: string;
  endReason: string | null;
  screenLabel: string | null;
  user: { name: string; username: string };
};

type AuditRow = {
  id: string;
  action: string;
  entity: string | null;
  data: unknown;
  createdAt: string;
  user: { name: string; username: string } | null;
};

function Field({ label, value, origin }: { label: string; value: React.ReactNode; origin?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-1.5">
      <span className="text-xs text-muted-foreground">
        {label}
        {origin ? <Badge variant="outline" className="ml-2 text-[10px]">{origin}</Badge> : null}
      </span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

export function ComputerDetail({
  computer: initial,
  sessions,
  audits,
  structure,
  canEdit,
  canAdmin,
  glpiPublicUrl,
}: {
  computer: ComputerData;
  sessions: SessionRow[];
  audits: AuditRow[];
  structure: {
    buildings: { id: string; name: string; floors: { id: string; name: string }[] }[];
    departments: { id: string; name: string; code: string }[];
    credentials: { id: string; name: string }[];
  };
  canEdit: boolean;
  canAdmin: boolean;
  glpiPublicUrl?: string;
}) {
  const router = useRouter();
  const [computer, setComputer] = useState(initial);
  const fromGlpi = computer.glpiId != null;
  const inventoryOrigin = fromGlpi ? "GLPI" : "OCS";
  const glpiLink = fromGlpi && glpiPublicUrl
    ? `${glpiPublicUrl.replace(/\/+$/, "")}/front/computer.form.php?id=${computer.glpiId}`
    : null;
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [screens, setScreens] = useState(initial.screens);
  const [form, setForm] = useState(() => ({
    assignedTo: initial.assignedTo ?? "",
    phoneExt: initial.phoneExt ?? "",
    notes: initial.notes ?? "",
    assetTag: initial.assetTag ?? "",
    buildingId: initial.floor?.building.id ?? "",
    floorId: initial.floorId ?? "",
    officeId: initial.officeId ?? "",
    departmentId: initial.departmentId ?? "",
    credentialId: initial.credentialId ?? "",
    vncPort: String(initial.vncPort),
    vncOverride: initial.vncOverride ?? "",
    adUsername: initial.adUsername ?? "",
  }));
  const [directoryOptions, setDirectoryOptions] = useState<{ username: string; displayName: string; department: string | null; phone: string | null }[]>([]);
  const [suggestions, setSuggestions] = useState<{ username: string; displayName: string; score: number; ambiguous: boolean }[]>([]);

  const floorsOfBuilding =
    structure.buildings.find((b) => b.id === form.buildingId)?.floors ?? [];

  async function saveEdit() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/computers/${computer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedTo: form.assignedTo || null,
          phoneExt: form.phoneExt || null,
          notes: form.notes || null,
          assetTag: form.assetTag || null,
          floorId: form.floorId || null,
          officeId: form.officeId === "__none__" ? null : form.officeId || null,
          departmentId: form.departmentId || null,
          credentialId: form.credentialId || null,
          vncPort: Number(form.vncPort) || 5900,
          vncOverride: form.vncOverride ? form.vncOverride : null,
          adUsername: form.adUsername || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error?.message ?? "No se pudo guardar.");
        return;
      }
      setEditOpen(false);
      router.refresh();
      setMessage("Cambios guardados.");
    } finally {
      setBusy(false);
    }
  }

  async function searchDirectory(query: string) {
    setForm((current) => ({ ...current, adUsername: query }));
    if (!query.trim()) return setDirectoryOptions([]);
    const response = await fetch(`/api/directory/users?q=${encodeURIComponent(query)}`);
    if (response.ok) setDirectoryOptions((await response.json()).users);
  }

  async function loadSuggestions() {
    if (!form.assignedTo) return;
    const response = await fetch(`/api/directory/suggest?name=${encodeURIComponent(form.assignedTo)}`);
    if (response.ok) setSuggestions((await response.json()).suggestions);
  }

  async function probeNow() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/computers/${computer.id}/probe`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error?.message ?? "No se pudo sondear el equipo.");
        return;
      }
      setComputer((prev) => ({ ...prev, ...data.computer }));
      setMessage(`Sondeo completado: ${data.state}`);
    } finally {
      setBusy(false);
    }
  }

  async function setArchived(archived: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/computers/${computer.id}/${archived ? "archive" : "restore"}`, {
        method: "POST",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveScreens(next = screens) {
    setBusy(true);
    const res = await fetch(`/api/computers/${computer.id}/screens`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next.map(({ index, label, port, enabled }) => ({ index, label, port, enabled }))),
    });
    const data = await res.json();
    if (res.ok) {
      setScreens(data.items);
      setMessage("Pantallas guardadas.");
      router.refresh();
    } else setMessage(data?.error?.message ?? "No se pudieron guardar las pantallas.");
    setBusy(false);
  }

  async function discoverScreensNow() {
    setBusy(true);
    setMessage("Sondeando puertos 5901-5904…");
    const res = await fetch(`/api/computers/${computer.id}/screens/discover`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setScreens(data.items);
      setMessage(`Detección completada: ${data.items.filter((screen: { reachable: boolean }) => screen.reachable).length} accesibles.`);
      router.refresh();
    } else setMessage(data?.error?.message ?? "No se pudo detectar pantallas.");
    setBusy(false);
  }

  function addScreen() {
    const used = new Set(screens.map((screen) => screen.index));
    const index = [1, 2, 3, 4].find((value) => !used.has(value));
    if (!index) return;
    setScreens([...screens, {
      id: `new-${index}`,
      index,
      label: `Pantalla ${index}`,
      port: 5900 + index,
      enabled: true,
      source: "MANUAL",
      reachable: null,
      lastProbeAt: null,
      lastOkAt: null,
    }].sort((a, b) => a.index - b.index));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <Button variant="outline" onClick={probeNow} disabled={busy}>
              <ScanSearch className="h-4 w-4" />
              Comprobar ahora
            </Button>
          </>
        ) : null}
        {canAdmin ? (
          <Button variant="outline" onClick={() => setArchived(!computer.archived)} disabled={busy}>
            {computer.archived ? (
              <>
                <ArchiveRestore className="h-4 w-4" /> Restaurar
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" /> Archivar
              </>
            )}
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={() => router.refresh()} title="Actualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {glpiLink ? (
          <a
            href={glpiLink}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            Abrir en GLPI
          </a>
        ) : null}
        {message ? <span className="text-sm text-green-600">{message}</span> : null}
      </div>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="ubicacion">Ubicación</TabsTrigger>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          <TabsTrigger value="pantallas">Pantallas</TabsTrigger>
          <TabsTrigger value="sesiones">Sesiones</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Identidad</CardTitle>
              </CardHeader>
              <CardContent>
                <Field label="Hostname" value={computer.hostname} origin={inventoryOrigin} />
                {fromGlpi
                  ? <Field label="ID GLPI" value={computer.glpiId} origin="GLPI" />
                  : <Field label="ID OCS" value={computer.ocsId} origin="OCS" />}
                <Field label="Nº de serie" value={computer.serial} origin={inventoryOrigin} />
                <Field label="Etiqueta de inventario" value={computer.assetTag} origin={fromGlpi ? "GLPI" : "Manual"} />
                <Field label="Fuente" value={computer.source} />
                <Field label="Referencia externa (GLPI)" value={computer.externalRef} origin="Manual" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Red</CardTitle>
              </CardHeader>
              <CardContent>
                <Field label="IP" value={computer.ip} origin={inventoryOrigin} />
                <Field label="MAC" value={computer.mac} origin={inventoryOrigin} />
                <Field label="Dominio" value={computer.domain} origin={inventoryOrigin} />
                <Field label="Último usuario" value={computer.lastUser} origin={inventoryOrigin} />
                <Field label="Nombre en directorio" value={computer.lastUserDirectoryName} origin="Directorio" />
                <Field label="Último inventario OCS" value={formatDateTime(computer.ocsLastInventory)} origin={inventoryOrigin} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Gestión</CardTitle>
              </CardHeader>
              <CardContent>
                <Field label="Asignado a" value={computer.assignedTo} origin="Manual" />
                <Field label="Usuario de dominio" value={<>{computer.adUsername ?? "—"}{computer.adUsername && computer.lastUserNorm && computer.adUsername !== computer.lastUserNorm ? <TriangleAlert className="ml-1 inline h-4 w-4 text-amber-600" /> : null}</>} origin="Manual" />
                {computer.directoryUser ? <Field label="Datos del directorio" value={[computer.directoryUser.displayName, computer.directoryUser.department, computer.directoryUser.phone].filter(Boolean).join(" · ")} origin="Directorio" /> : null}
                <Field label="Extensión" value={computer.phoneExt} origin="Manual" />
                <Field label="Notas" value={computer.notes} origin="Manual" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">VNC</CardTitle>
              </CardHeader>
              <CardContent>
                <Field
                  label="Instalado"
                  value={
                    <>
                      {computer.vncOverride ?? computer.vncInstalled}
                      {computer.vncOverride ? " (forzado manualmente)" : ""}
                    </>
                  }
                  origin={computer.vncInstalledSrc ?? "Manual"}
                />
                <Field label="Versión" value={computer.vncVersion} origin={inventoryOrigin} />
                <Field label="Puerto" value={computer.vncPort} origin="Manual" />
                <Field
                  label="Credencial"
                  value={computer.credential ? `${computer.credential.name}${computer.credential.isDefault ? " (por defecto)" : ""}` : "Por defecto"}
                  origin="Manual"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Estado en vivo</CardTitle>
              </CardHeader>
              <CardContent>
                <Field
                  label="Estado"
                  value={
                    <StateBadge
                      state={
                        computer.online === true && computer.vncReachable === true
                          ? "READY"
                          : computer.online === true && computer.vncReachable === false
                            ? "NOT_LISTENING"
                            : computer.vncOverride === "NO" || (computer.vncOverride === null && computer.vncInstalled === "NO")
                              ? "NOT_INSTALLED"
                              : computer.online === false
                                ? "OFFLINE"
                                : "UNKNOWN"
                      }
                    />
                  }
                />
                <Field label="En línea" value={computer.online === null ? "sin sondear" : computer.online ? "sí" : "no"} />
                <Field label="VNC accesible" value={computer.vncReachable === null ? "sin sondear" : computer.vncReachable ? "sí" : "no"} />
                <Field label="Versión RFB" value={computer.rfbVersion} />
                <Field label="Último sondeo" value={formatDateTime(computer.lastProbeAt)} />
                <Field label="Última respuesta" value={formatDateTime(computer.lastSeenAt)} />
                <Field label="Último banner RFB" value={formatDateTime(computer.lastVncOkAt)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Fechas</CardTitle>
              </CardHeader>
              <CardContent>
                <Field label="Creado" value={formatDateTime(computer.createdAt)} />
                <Field label="Actualizado" value={formatDateTime(computer.updatedAt)} />
                <Field label="Pantallas (OCS)" value={computer.monitorCount} origin={inventoryOrigin} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ubicacion">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ubicación física</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Edificio" value={computer.floor?.building.name ?? "Sin ubicar"} origin="Manual" />
                <Field label="Planta" value={computer.floor?.name ?? "—"} origin="Manual" />
                <Field label="Despacho" value={computer.office ? `${computer.office.code} · ${computer.office.name}` : "—"} origin="Manual" />
                <Field label="Departamento" value={computer.department?.name ?? "—"} origin="Manual" />
                <Field
                  label="Posición en el plano"
                  value={
                    computer.posX != null && computer.posY != null
                      ? `x=${computer.posX.toFixed(3)} y=${computer.posY.toFixed(3)}`
                      : "Sin colocar"
                  }
                  origin="Manual"
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Usa{" "}
                <a className="underline" href={`/mapa?focus=${computer.id}`}>
                  Ver en plano
                </a>{" "}
                para abrir el mapa completo.
              </p>
              {computer.floorId ? (
                <div className="mt-3 inline-block overflow-hidden rounded-md border">
                  <div className="relative w-[360px]">
                    <img
                      src={`/api/floors/${computer.floorId}/plan`}
                      alt="Miniatura del plano de la planta"
                      className="block w-full"
                    />
                    {computer.posX != null && computer.posY != null ? (
                      <span
                        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600"
                        style={{
                          left: `${computer.posX * 100}%`,
                          top: `${computer.posY * 100}%`,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardware">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Hardware y sistema operativo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-3">
                <Field label="Fabricante" value={computer.manufacturer} origin={inventoryOrigin} />
                <Field label="Modelo" value={computer.model} origin={inventoryOrigin} />
                <Field label="CPU" value={computer.cpu} origin={inventoryOrigin} />
                <Field label="RAM" value={computer.ramMb ? `${computer.ramMb} MB` : null} origin={inventoryOrigin} />
                <Field label="Disco" value={computer.diskGb ? `${computer.diskGb} GB` : null} origin={inventoryOrigin} />
                <Field label="SO" value={[computer.os, computer.osVersion].filter(Boolean).join(" ")} origin={inventoryOrigin} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pantallas">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Pantallas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-2">
                {canEdit ? (
                  <>
                    <Button size="sm" variant="outline" onClick={discoverScreensNow} disabled={busy}>
                      <ScanSearch className="h-4 w-4" /> Detectar pantallas
                    </Button>
                    <Button size="sm" variant="outline" onClick={addScreen} disabled={busy || screens.length >= 4}>
                      <Plus className="h-4 w-4" /> Añadir manualmente
                    </Button>
                    <Button size="sm" onClick={() => void saveScreens()} disabled={busy}>
                      Guardar
                    </Button>
                  </>
                ) : null}
              </div>
              {screens.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin pantallas configuradas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Índice</TableHead>
                      <TableHead>Etiqueta</TableHead>
                      <TableHead>Puerto</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Habilitada</TableHead>
                      <TableHead>Estado</TableHead>
                      {canEdit ? <TableHead className="w-10" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {screens.map((screen) => (
                      <TableRow key={screen.id}>
                        <TableCell>{screen.index}</TableCell>
                        <TableCell>
                          <Input value={screen.label} disabled={!canEdit} onChange={(event) => setScreens((current) => current.map((item) => item.id === screen.id ? { ...item, label: event.target.value } : item))} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-24" type="number" min={5901} max={5909} value={screen.port} disabled={!canEdit} onChange={(event) => setScreens((current) => current.map((item) => item.id === screen.id ? { ...item, port: Number(event.target.value) } : item))} />
                        </TableCell>
                        <TableCell>{screen.source}</TableCell>
                        <TableCell><Checkbox checked={screen.enabled} disabled={!canEdit} onChange={(event) => setScreens((current) => current.map((item) => item.id === screen.id ? { ...item, enabled: event.target.checked } : item))} /></TableCell>
                        <TableCell>
                          {screen.reachable === null ? "sin sondear" : screen.reachable ? "accesible" : "sin respuesta"}
                          {screen.lastProbeAt ? <span className="block text-xs text-muted-foreground">{formatDateTime(screen.lastProbeAt)}</span> : null}
                        </TableCell>
                        {canEdit ? <TableCell><Button size="icon" variant="ghost" title="Quitar pantalla" onClick={() => setScreens((current) => current.filter((item) => item.id !== screen.id))}><Trash2 className="h-4 w-4" /></Button></TableCell> : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sesiones">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Últimas 20 sesiones remotas</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Datos</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>{formatDateTime(session.createdAt)}</TableCell>
                      <TableCell>{session.user.name || session.user.username}</TableCell>
                      <TableCell>{session.mode}{session.screenLabel ? ` · ${session.screenLabel}` : ""}</TableCell>
                      <TableCell>
                        <Badge variant={session.status === "ACTIVE" ? "default" : "secondary"}>{session.status}</Badge>
                      </TableCell>
                      <TableCell>{formatDuration(session.startedAt ?? session.createdAt, session.endedAt)}</TableCell>
                      <TableCell>
                        ↓ {formatBytes(Number(session.bytesIn))} · ↑ {formatBytes(Number(session.bytesOut))}
                      </TableCell>
                      <TableCell>{session.reason ?? session.endReason ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                        Sin sesiones registradas.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auditoria">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Últimos cambios</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audits.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell>{entry.user?.name ?? "sistema"}</TableCell>
                      <TableCell>{entry.action}</TableCell>
                      <TableCell className="max-w-[320px] truncate text-xs">
                        {entry.data ? JSON.stringify(entry.data) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {audits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        Sin cambios registrados.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar {computer.hostname}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="assignedTo">Asignado a</Label>
              <Input id="assignedTo" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} onBlur={loadSuggestions} />
            </div>
            <div>
              <Label htmlFor="adUsername">Usuario de dominio asignado</Label>
              <Input id="adUsername" list="directory-users" value={form.adUsername} onChange={(e) => searchDirectory(e.target.value)} />
              <datalist id="directory-users">{directoryOptions.map((user) => <option key={user.username} value={user.username}>{user.displayName}</option>)}</datalist>
              {form.adUsername && directoryOptions.length === 0 ? <p className="text-xs text-amber-600">Usuario no encontrado en el directorio; se puede guardar igualmente.</p> : null}
              {directoryOptions.find((user) => user.username === form.adUsername) ? <p className="text-xs text-muted-foreground">{[directoryOptions.find((user) => user.username === form.adUsername)?.displayName, directoryOptions.find((user) => user.username === form.adUsername)?.department, directoryOptions.find((user) => user.username === form.adUsername)?.phone].filter(Boolean).join(" · ")}</p> : null}
            </div>
            {computer.lastUserNorm ? <div className="flex items-end"><Button type="button" variant="outline" onClick={() => setForm({ ...form, adUsername: computer.lastUserNorm ?? "" })}>Usar último usuario de OCS</Button></div> : null}
            {suggestions.length ? <div className="md:col-span-2 flex flex-wrap gap-2 text-xs">{suggestions.map((suggestion) => <button type="button" key={suggestion.username} disabled={suggestion.ambiguous} onClick={() => setForm({ ...form, adUsername: suggestion.username })} className="rounded-full border px-2 py-1 disabled:opacity-60">{suggestion.ambiguous ? "Varias coincidencias" : suggestion.displayName} · {Math.round(suggestion.score * 100)}%</button>)}</div> : null}
            <div>
              <Label htmlFor="phoneExt">Extensión</Label>
              <Input id="phoneExt" value={form.phoneExt} onChange={(e) => setForm({ ...form, phoneExt: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="assetTag">Etiqueta de inventario</Label>
              <Input id="assetTag" value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="vncPort">Puerto VNC</Label>
              <Input id="vncPort" type="number" min={5900} max={5909} value={form.vncPort} onChange={(e) => setForm({ ...form, vncPort: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="buildingId">Edificio</Label>
              <Select
                id="buildingId"
                value={form.buildingId}
                onChange={(e) => setForm({ ...form, buildingId: e.target.value, floorId: "", officeId: "" })}
              >
                <option value="">Sin ubicar</option>
                {structure.buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="floorId">Planta</Label>
              <Select
                id="floorId"
                value={form.floorId}
                onChange={(e) => setForm({ ...form, floorId: e.target.value, officeId: "" })}
                disabled={!form.buildingId}
              >
                <option value="">—</option>
                {floorsOfBuilding.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="officeId">Despacho</Label>
              <Select
                id="officeId"
                value={form.officeId}
                onChange={(e) => setForm({ ...form, officeId: e.target.value })}
                disabled={!form.floorId}
              >
                <option value="">—</option>
                {computer.office && form.officeId === computer.office.id ? (
                  <option value={computer.office.id}>{computer.office.code} · {computer.office.name}</option>
                ) : null}
                <option value="__none__">Sin despacho</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="departmentId">Departamento</Label>
              <Select id="departmentId" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">—</option>
                {structure.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="credentialId">Credencial VNC</Label>
              <Select id="credentialId" value={form.credentialId} onChange={(e) => setForm({ ...form, credentialId: e.target.value })}>
                <option value="">Por defecto</option>
                {structure.credentials.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="vncOverride">Forzar estado instalado</Label>
              <Select id="vncOverride" value={form.vncOverride} onChange={(e) => setForm({ ...form, vncOverride: e.target.value })}>
                <option value="">Automático</option>
                <option value="YES">Sí instalado</option>
                <option value="NO">No instalado</option>
                <option value="UNKNOWN">Desconocido</option>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={busy}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
