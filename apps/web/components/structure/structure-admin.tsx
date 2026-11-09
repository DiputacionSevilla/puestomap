"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/dialog";

export type StructureData = {
  buildings: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    floors: {
      id: string;
      name: string;
      level: number;
      planFile: string | null;
      planWidth: number | null;
      planHeight: number | null;
      _count: { computers: number; offices: number };
    }[];
  }[];
  departments: { id: string; code: string; name: string; _count: { computers: number; offices: number } }[];
  offices: {
    id: string;
    code: string;
    name: string;
    floorId: string;
    floor: { id: string; name: string; building: { name: string } };
    department: { id: string; name: string } | null;
    _count: { computers: number };
  }[];
};

type Kind = "building" | "floor" | "department" | "office";

export function StructureAdmin({
  data,
  isAdmin,
}: {
  data: StructureData;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ kind: Kind; id?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  function openCreate(kind: Kind) {
    setForm({});
    setError(null);
    setDialog({ kind });
  }

  function openEdit(kind: Kind, id: string, values: Record<string, string>) {
    setForm(values);
    setError(null);
    setDialog({ kind, id });
  }

  async function save() {
    if (!dialog) return;
    setBusy(true);
    setError(null);
    const { kind, id } = dialog;
    const base =
      kind === "building"
        ? "/api/buildings"
        : kind === "floor"
          ? "/api/floors"
          : kind === "department"
            ? "/api/departments"
            : "/api/offices";
    const url = id ? `${base}/${id}` : base;
    try {
      const res = await fetch(url, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "building"
            ? { code: form.code, name: form.name, address: form.address || null }
            : kind === "floor"
              ? id
                ? { name: form.name, level: Number(form.level) || 0 }
                : { buildingId: form.buildingId, name: form.name, level: Number(form.level) || 0 }
              : kind === "department"
                ? { code: form.code, name: form.name }
                : id
                  ? {
                      code: form.code,
                      name: form.name,
                      departmentId: form.departmentId || null,
                    }
                  : {
                      floorId: form.floorId,
                      code: form.code,
                      name: form.name,
                      departmentId: form.departmentId || null,
                    },
        ),
      });
      const dataRes = await res.json();
      if (!res.ok) {
        setError(dataRes?.error?.message ?? "No se pudo guardar.");
        return;
      }
      setDialog(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: Kind, id: string, label: string) {
    if (!window.confirm(`¿Borrar ${label}?`)) return;
    const base =
      kind === "building"
        ? "/api/buildings"
        : kind === "floor"
          ? "/api/floors"
          : kind === "department"
            ? "/api/departments"
            : "/api/offices";
    const res = await fetch(`${base}/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data?.error?.message ?? "No se pudo borrar.");
      return;
    }
    router.refresh();
  }

  async function uploadPlan(floorId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/floors/${floorId}/plan`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data?.error?.message ?? "No se pudo subir el plano.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="buildings">
        <TabsList>
          <TabsTrigger value="buildings">Edificios y plantas</TabsTrigger>
          <TabsTrigger value="departments">Departamentos</TabsTrigger>
          <TabsTrigger value="offices">Despachos</TabsTrigger>
        </TabsList>

        <TabsContent value="buildings">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Edificios</CardTitle>
              {isAdmin ? (
                <Button size="sm" onClick={() => openCreate("building")}>
                  <Plus className="h-4 w-4" /> Nuevo edificio
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-6">
              {data.buildings.map((building) => (
                <div key={building.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">
                        {building.name}{" "}
                        <span className="text-xs text-muted-foreground">({building.code})</span>
                      </h3>
                      <p className="text-xs text-muted-foreground">{building.address ?? ""}</p>
                    </div>
                    {isAdmin ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            openEdit("building", building.id, {
                              code: building.code,
                              name: building.name,
                              address: building.address ?? "",
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove("building", building.id, `el edificio ${building.name}`)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Planta</TableHead>
                        <TableHead>Nivel</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>Equipos</TableHead>
                        <TableHead>Despachos</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {building.floors.map((floor) => (
                        <TableRow key={floor.id}>
                          <TableCell>{floor.name}</TableCell>
                          <TableCell>{floor.level}</TableCell>
                          <TableCell>
                            {floor.planFile ? (
                              <span className="text-xs">
                                {floor.planWidth}×{floor.planHeight}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">sin plano</span>
                            )}
                            {isAdmin ? (
                              <label className="ml-2 cursor-pointer text-xs text-primary hover:underline">
                                <Upload className="mr-1 inline h-3 w-3" />
                                {floor.planFile ? "Reemplazar" : "Subir"}
                                <input
                                  type="file"
                                  accept=".png,.jpg,.jpeg,.webp,.svg"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) uploadPlan(floor.id, file);
                                  }}
                                />
                              </label>
                            ) : null}
                          </TableCell>
                          <TableCell>{floor._count.computers}</TableCell>
                          <TableCell>{floor._count.offices}</TableCell>
                          <TableCell>
                            {isAdmin ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    openEdit("floor", floor.id, {
                                      name: floor.name,
                                      level: String(floor.level),
                                      buildingId: building.id,
                                    })
                                  }
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => remove("floor", floor.id, `la planta ${floor.name}`)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => {
                        setForm({ buildingId: building.id });
                        setError(null);
                        setDialog({ kind: "floor" });
                      }}
                    >
                      <Plus className="h-4 w-4" /> Nueva planta en {building.name}
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Departamentos</CardTitle>
              {isAdmin ? (
                <Button size="sm" onClick={() => openCreate("department")}>
                  <Plus className="h-4 w-4" /> Nuevo departamento
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Equipos</TableHead>
                    <TableHead>Despachos</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.departments.map((department) => (
                    <TableRow key={department.id}>
                      <TableCell>{department.code}</TableCell>
                      <TableCell>{department.name}</TableCell>
                      <TableCell>{department._count.computers}</TableCell>
                      <TableCell>{department._count.offices}</TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                openEdit("department", department.id, {
                                  code: department.code,
                                  name: department.name,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => remove("department", department.id, `el departamento ${department.name}`)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offices">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Despachos</CardTitle>
              <Button size="sm" onClick={() => openCreate("office")}>
                <Plus className="h-4 w-4" /> Nuevo despacho
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Edificio / Planta</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Equipos</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.offices.map((office) => (
                    <TableRow key={office.id}>
                      <TableCell>{office.code}</TableCell>
                      <TableCell>{office.name}</TableCell>
                      <TableCell>
                        {office.floor.building.name} / {office.floor.name}
                      </TableCell>
                      <TableCell>{office.department?.name ?? "—"}</TableCell>
                      <TableCell>{office._count.computers}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              openEdit("office", office.id, {
                                code: office.code,
                                name: office.name,
                                floorId: office.floorId,
                                departmentId: office.department?.id ?? "",
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove("office", office.id, `el despacho ${office.name}`)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.id ? "Editar" : "Nuevo"}{" "}
              {dialog?.kind === "building"
                ? "edificio"
                : dialog?.kind === "floor"
                  ? "planta"
                  : dialog?.kind === "department"
                    ? "departamento"
                    : "despacho"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {dialog?.kind === "building" ? (
              <>
                <div>
                  <Label htmlFor="code">Código</Label>
                  <Input id="code" value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="address">Dirección</Label>
                  <Input id="address" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
              </>
            ) : null}

            {dialog?.kind === "floor" ? (
              <>
                {!dialog.id ? (
                  <div>
                    <Label htmlFor="buildingId">Edificio</Label>
                    <Select
                      id="buildingId"
                      value={form.buildingId ?? ""}
                      onChange={(e) => setForm({ ...form, buildingId: e.target.value })}
                    >
                      <option value="">—</option>
                      {data.buildings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="level">Nivel</Label>
                  <Input
                    id="level"
                    type="number"
                    value={form.level ?? "0"}
                    onChange={(e) => setForm({ ...form, level: e.target.value })}
                  />
                </div>
              </>
            ) : null}

            {dialog?.kind === "department" ? (
              <>
                <div>
                  <Label htmlFor="code">Código</Label>
                  <Input id="code" value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
              </>
            ) : null}

            {dialog?.kind === "office" ? (
              <>
                {!dialog.id ? (
                  <div>
                    <Label htmlFor="floorId">Planta</Label>
                    <Select
                      id="floorId"
                      value={form.floorId ?? ""}
                      onChange={(e) => setForm({ ...form, floorId: e.target.value })}
                    >
                      <option value="">—</option>
                      {data.buildings.flatMap((b) =>
                        b.floors.map((f) => (
                          <option key={f.id} value={f.id}>
                            {b.name} / {f.name}
                          </option>
                        )),
                      )}
                    </Select>
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="code">Código</Label>
                  <Input id="code" value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="departmentId">Departamento</Label>
                  <Select
                    id="departmentId"
                    value={form.departmentId ?? ""}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  >
                    <option value="">—</option>
                    {data.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={busy}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
