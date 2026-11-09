import { getPrisma } from "@puestomap/db";
import type { Prisma } from "@puestomap/db";
import { normalizeHostname, validateComputerCsvRows } from "@puestomap/shared";
import { errorResponse, jsonOk, requireRole } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import {
  loadKnownStructure,
  parseComputerCsv,
  resolveStructureIds,
  summarize,
} from "@/lib/import-csv";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole("ADMIN");
    const body = (await req.json()) as { csv?: string; createMissing?: boolean };
    if (typeof body.csv !== "string" || body.csv.length === 0) {
      return jsonOk({ error: { code: "VALIDATION", message: "Falta el CSV" } }, 422);
    }
    const createMissing = body.createMissing === true;
    const rows = parseComputerCsv(body.csv);
    const known = await loadKnownStructure();
    const results = validateComputerCsvRows(rows, known, { createMissing });

    const prisma = getPrisma();
    const run = await prisma.syncRun.create({
      data: { type: "CSV", status: "RUNNING" },
    });

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    for (const result of results) {
      if (result.errors.length > 0 || !result.values) {
        errors += 1;
        continue;
      }
      const values = result.values;
      const hostname = normalizeHostname(values.hostname);
      const ids = createMissing
        ? await resolveStructureIds(values)
        : { floorId: null, officeId: null, departmentId: null, credentialId: null };

      const existing = createMissing
        ? await prisma.computer.findUnique({ where: { hostname } })
        : await prisma.computer.findUnique({
            where: { hostname },
            select: {
              id: true,
              ip: true,
              assignedTo: true,
              phoneExt: true,
              notes: true,
              assetTag: true,
              vncPort: true,
              posX: true,
              posY: true,
              floorId: true,
              officeId: true,
              departmentId: true,
              credentialId: true,
            },
          });

      const data: Record<string, unknown> = {};
      if (values.ip !== undefined) data.ip = values.ip;
      if (values.assignedTo !== undefined) data.assignedTo = values.assignedTo;
      if (values.phoneExt !== undefined) data.phoneExt = values.phoneExt;
      if (values.notes !== undefined) data.notes = values.notes;
      if (values.assetTag !== undefined) data.assetTag = values.assetTag;
      if (values.vncPort !== undefined) data.vncPort = values.vncPort;
      if (values.posX !== undefined) data.posX = values.posX;
      if (values.posY !== undefined) data.posY = values.posY;
      if (values.buildingCode !== undefined && ids.floorId) data.floorId = ids.floorId;
      if (values.officeCode !== undefined && ids.officeId) data.officeId = ids.officeId;
      if (values.departmentCode !== undefined && ids.departmentId) data.departmentId = ids.departmentId;
      if (values.credentialName !== undefined && ids.credentialId) data.credentialId = ids.credentialId;

      if (existing) {
        const changes = Object.entries(data).filter(
          ([key, value]) =>
            JSON.stringify((existing as Record<string, unknown>)[key] ?? null) !==
            JSON.stringify(value ?? null),
        );
        if (changes.length === 0) {
          unchanged += 1;
        } else {
          await prisma.computer.update({
            where: { id: existing.id },
            data: data as unknown as Prisma.ComputerUncheckedUpdateInput,
          });
          updated += 1;
        }
      } else {
        await prisma.computer.create({
          data: {
            hostname,
            source: "CSV",
            ip: (data.ip as string | undefined) ?? null,
            assignedTo: (data.assignedTo as string | undefined) ?? null,
            phoneExt: (data.phoneExt as string | undefined) ?? null,
            notes: (data.notes as string | undefined) ?? null,
            assetTag: (data.assetTag as string | undefined) ?? null,
            vncPort: (data.vncPort as number | undefined) ?? 5900,
            posX: (data.posX as number | undefined) ?? null,
            posY: (data.posY as number | undefined) ?? null,
            floorId: (data.floorId as string | undefined) ?? null,
            officeId: (data.officeId as string | undefined) ?? null,
            departmentId: (data.departmentId as string | undefined) ?? null,
            credentialId: (data.credentialId as string | undefined) ?? null,
          },
        });
        created += 1;
      }
    }

    const summary = { created, updated, unchanged, errors, ...summarize(results) };
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: errors > 0 ? "PARTIAL" : "OK",
        finishedAt: new Date(),
        stats: summary as unknown as Prisma.InputJsonValue,
      },
    });
    await audit({
      userId: user.id,
      action: "import.computers",
      entity: "SyncRun",
      entityId: run.id,
      data: summary as Record<string, unknown>,
      ip: clientIp(req),
    });
    return jsonOk(summary);
  } catch (err) {
    return errorResponse(err);
  }
}
