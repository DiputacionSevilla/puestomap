"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Checkbox } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { formatDateTime, formatDuration } from "@/lib/format";

type SyncRunRow = {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  stats: unknown;
  error: string | null;
};

type CredentialRow = {
  id: string;
  name: string;
  isDefault: boolean;
  updatedAt: string;
  _count: { computers: number };
};

type UserRow = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
};

export function SettingsPanel({
  syncRuns,
  credentials,
  users,
  probeConfig,
  isAdmin,
  currentUserId: _currentUserId,
}: {
  syncRuns: SyncRunRow[];
  credentials: CredentialRow[];
  users: UserRow[];
  probeConfig: Record<string, string>;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [credentialDialog, setCredentialDialog] = useState<{ id?: string } | null>(null);
  const [userDialog, setUserDialog] = useState<{ id?: string } | null>(null);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync/glpi", { method: "POST" });
      const data = await res.json();
      setMessage(
        res.ok
          ? "Sincronización solicitada; el worker la recogerá en menos de 30 s."
          : (data?.error?.message ?? "No se pudo solicitar la sincronización."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveCredential() {
    setBusy(true);
    try {
      const url = credentialDialog?.id ? `/api/credentials/${credentialDialog.id}` : "/api/credentials";
      const res = await fetch(url, {
        method: credentialDialog?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          password: form.password,
          isDefault: form.isDefault === "true",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error?.message ?? "No se pudo guardar la credencial.");
        return;
      }
      if (data.truncated) setMessage("La contraseña se ha truncado a 8 caracteres (límite VNC).");
      setCredentialDialog(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeCredential(id: string, name: string) {
    if (!window.confirm(`¿Borrar la credencial ${name}?`)) return;
    const res = await fetch(`/api/credentials/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) window.alert(data?.error?.message ?? "No se pudo borrar.");
    router.refresh();
  }

  async function saveUser() {
    setBusy(true);
    try {
      const url = userDialog?.id ? `/api/users/${userDialog.id}` : "/api/users";
      const res = await fetch(url, {
        method: userDialog?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          name: form.name,
          email: form.email || null,
          password: form.password,
          role: form.role || "TECH",
          active: form.active !== "false",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error?.message ?? "No se pudo guardar el usuario.");
        return;
      }
      setUserDialog(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeOwnPassword() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error?.message ?? "No se pudo cambiar la contraseña.");
        return;
      }
      setPasswordDialog(false);
      setMessage("Contraseña actualizada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      <Tabs defaultValue="ocs">
        <TabsList>
          <TabsTrigger value="ocs">GLPI</TabsTrigger>
          <TabsTrigger value="probe">Sondeo</TabsTrigger>
          <TabsTrigger value="credentials">Credenciales VNC</TabsTrigger>
          {isAdmin ? <TabsTrigger value="users">Usuarios</TabsTrigger> : null}
          <TabsTrigger value="account">Mi cuenta</TabsTrigger>
        </TabsList>

        <TabsContent value="ocs">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm">Sincronización con GLPI</CardTitle>
                <CardDescription>
                  Las ejecuciones programadas siguen el patrón configurado en GLPI_SYNC_CRON.
                </CardDescription>
              </div>
              <Button onClick={syncNow} disabled={busy}>
                <RefreshCw className="h-4 w-4" />
                Sincronizar ahora
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>{run.type}</TableCell>
                      <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                      <TableCell>
                        {run.finishedAt ? formatDuration(run.startedAt, run.finishedAt) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={run.status === "OK" ? "default" : run.status === "RUNNING" ? "secondary" : "destructive"}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs">
                        {run.error ?? (run.stats ? JSON.stringify(run.stats) : "—")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {syncRuns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        Sin ejecuciones registradas todavía.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="probe">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Parámetros de sondeo (solo lectura)</CardTitle>
              <CardDescription>Se configuran con variables de entorno del worker.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2">
                {Object.entries(probeConfig).map(([key, value]) => (
                  <div key={key} className="flex justify-between border-b py-1 text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credentials">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm">Credenciales VNC</CardTitle>
                <CardDescription>
                  Las contraseñas se guardan cifradas (AES-256-GCM) y nunca se muestran de nuevo.
                </CardDescription>
              </div>
              {isAdmin ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setForm({});
                    setCredentialDialog({});
                  }}
                >
                  <Plus className="h-4 w-4" /> Nueva credencial
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Por defecto</TableHead>
                    <TableHead>Equipos</TableHead>
                    <TableHead>Actualizada</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credentials.map((credential) => (
                    <TableRow key={credential.id}>
                      <TableCell>
                        <KeyRound className="mr-1 inline h-3.5 w-3.5" />
                        {credential.name}
                      </TableCell>
                      <TableCell>{credential.isDefault ? "sí" : "—"}</TableCell>
                      <TableCell>{credential._count.computers}</TableCell>
                      <TableCell>{formatDateTime(credential.updatedAt)}</TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setForm({ name: credential.name, isDefault: String(credential.isDefault) });
                                setCredentialDialog({ id: credential.id });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeCredential(credential.id, credential.name)}
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

        {isAdmin ? (
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">
                  <Users className="mr-1 inline h-4 w-4" />
                  Usuarios
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    setForm({ role: "TECH", active: "true" });
                    setUserDialog({});
                  }}
                >
                  <Plus className="h-4 w-4" /> Nuevo usuario
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Activo</TableHead>
                      <TableHead>Último acceso</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>{user.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{user.role}</Badge>
                        </TableCell>
                        <TableCell>{user.active ? "sí" : "no"}</TableCell>
                        <TableCell>{formatDateTime(user.lastLoginAt)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setForm({
                                name: user.name,
                                email: user.email ?? "",
                                role: user.role,
                                active: String(user.active),
                              });
                              setUserDialog({ id: user.id });
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mi cuenta</CardTitle>
              <CardDescription>
                Puedes cambiar tu propia contraseña (mínimo 12 caracteres).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => {
                  setForm({});
                  setPasswordDialog(true);
                }}
              >
                Cambiar mi contraseña
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={credentialDialog !== null} onOpenChange={(open) => !open && setCredentialDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{credentialDialog?.id ? "Editar" : "Nueva"} credencial VNC</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="password">{credentialDialog?.id ? "Nueva contraseña (reemplazar)" : "Contraseña"}</Label>
              <Input
                id="password"
                type="password"
                value={form.password ?? ""}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                El protocolo VNC admite como máximo 8 caracteres: si escribes más, se trunca.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.isDefault === "true"}
                onChange={(e) => setForm({ ...form, isDefault: String(e.target.checked) })}
              />
              Usar como credencial por defecto
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredentialDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={saveCredential} disabled={busy}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={userDialog !== null} onOpenChange={(open) => !open && setUserDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{userDialog?.id ? "Editar" : "Nuevo"} usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!userDialog?.id ? (
              <div>
                <Label htmlFor="username">Usuario</Label>
                <Input id="username" value={form.username ?? ""} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
            ) : null}
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="password">{userDialog?.id ? "Nueva contraseña (opcional)" : "Contraseña"}</Label>
              <Input
                id="password"
                type="password"
                value={form.password ?? ""}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="role">Rol</Label>
              <Select id="role" value={form.role ?? "TECH"} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="ADMIN">ADMIN</option>
                <option value="TECH">TECH</option>
                <option value="VIEWER">VIEWER</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.active !== "false"}
                onChange={(e) => setForm({ ...form, active: String(e.target.checked) })}
              />
              Cuenta activa
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={saveUser} disabled={busy}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordDialog} onOpenChange={setPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar mi contraseña</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="currentPassword">Contraseña actual</Label>
              <Input
                id="currentPassword"
                type="password"
                value={form.currentPassword ?? ""}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="newPassword">Nueva contraseña (mín. 12 caracteres)</Label>
              <Input
                id="newPassword"
                type="password"
                value={form.newPassword ?? ""}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={changeOwnPassword} disabled={busy}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
