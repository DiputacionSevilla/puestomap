"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CreateComputerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    hostname: "",
    ip: "",
    assignedTo: "",
    phoneExt: "",
    notes: "",
  });

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/computers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: form.hostname,
          ip: form.ip || undefined,
          assignedTo: form.assignedTo || undefined,
          phoneExt: form.phoneExt || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "No se pudo crear el equipo.");
        return;
      }
      setOpen(false);
      router.push(`/equipos/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Nuevo equipo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alta manual de equipo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="hostname">Hostname (obligatorio, único)</Label>
            <Input
              id="hostname"
              value={form.hostname}
              onChange={(e) => setForm({ ...form, hostname: e.target.value })}
              placeholder="PC-INT-01"
            />
          </div>
          <div>
            <Label htmlFor="ip">IP</Label>
            <Input id="ip" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="assignedTo">Asignado a</Label>
            <Input
              id="assignedTo"
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="phoneExt">Extensión</Label>
            <Input
              id="phoneExt"
              value={form.phoneExt}
              onChange={(e) => setForm({ ...form, phoneExt: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="notes">Notas</Label>
            <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={create} disabled={busy || form.hostname.trim().length === 0}>
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
