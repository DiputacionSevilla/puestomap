import { getPrisma } from "@puestomap/db";
import type { Prisma } from "@puestomap/db";
import { log } from "@/lib/logger";

export type AuditEntry = {
  userId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown> | null;
  ip?: string | null;
};

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await getPrisma().auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        data: (entry.data ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: entry.ip ?? null,
      },
    });
  } catch (err) {
    log("error", "No se pudo registrar la auditoría", { action: entry.action, error: err });
  }
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}
