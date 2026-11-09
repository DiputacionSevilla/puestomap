import { getPrisma, Prisma } from "@puestomap/db";
import type { Prisma as PrismaTypes } from "@puestomap/db";
import {
  normKey,
  type ComputerImportCtx,
  type ComputerRowResult,
  type KnownBuilding,
  type StructureCtx,
  type StructureRowResult,
} from "@puestomap/shared";

export async function loadStructureCtx(): Promise<StructureCtx> {
  const prisma = getPrisma();
  const [buildings, departments] = await Promise.all([
    prisma.building.findMany({
      include: {
        floors: {
          include: {
            offices: true,
          },
        },
      },
    }),
    prisma.department.findMany({ select: { id: true, code: true, name: true } }),
  ]);
  return {
    buildings: buildings.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      floors: b.floors.map((f) => ({
        id: f.id,
        name: f.name,
        planFile: f.planFile,
        offices: f.offices.map((o) => ({
          id: o.id,
          code: o.code,
          name: o.name,
          departmentId: o.departmentId,
          rect: (o.rect as unknown as { x: number; y: number; w: number; h: number } | null) ?? null,
        })),
      })),
    })),
    departments,
  };
}

export async function loadComputerImportCtx(): Promise<{
  ctx: ComputerImportCtx;
  known: KnownBuilding[];
}> {
  const prisma = getPrisma();
  const [structure, credentials, computers, directoryUsers] = await Promise.all([
    loadStructureCtx(),
    prisma.vncCredential.findMany({ select: { id: true, name: true } }),
    prisma.computer.findMany({
      select: {
        id: true,
        hostname: true,
        ip: true,
        ocsId: true,
        assignedTo: true,
        adUsername: true,
        floorId: true,
        officeId: true,
        departmentId: true,
        posX: true,
        posY: true,
        vncPort: true,
        notes: true,
        assetTag: true,
        phoneExt: true,
      },
    }),
    prisma.directoryUser.findMany({
      select: { username: true, displayName: true },
    }),
  ]);
  return {
    ctx: {
      buildings: structure.buildings,
      departments: structure.departments,
      credentials,
      computers,
      directoryUsernames: new Set(directoryUsers.map((u) => u.username)),
      directoryEmpty: directoryUsers.length === 0,
      adUsers: new Map(directoryUsers.map((u) => [u.username, u.displayName])),
    },
    known: structure.buildings,
  };
}

export async function applyStructureImport(
  results: StructureRowResult[],
): Promise<{ created: number; updated: number; unchanged: number; errors: number }> {
  const prisma = getPrisma();
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  const ordered = [...results].sort((a, b) => {
    const order = { EDIFICIO: 0, PLANTA: 1, DEPARTAMENTO: 2, DESPACHO: 3 } as const;
    return order[a.values.tipo] - order[b.values.tipo];
  });

  await prisma.$transaction(async (tx) => {
    for (const result of ordered) {
      if (result.errors.length > 0) {
        errors += 1;
        continue;
      }
      const v = result.values;
      if (v.tipo === "EDIFICIO" && v.codigo && v.nombre) {
        const existing = await tx.building.findFirst({
          where: { code: { equals: v.codigo, mode: "insensitive" } },
        });
        if (!existing) {
          await tx.building.create({ data: { code: v.codigo, name: v.nombre } });
          created += 1;
        } else {
          await tx.building.update({ where: { id: existing.id }, data: { name: v.nombre } });
          if (result.action === "sin cambios") unchanged += 1;
          else updated += 1;
        }
      } else if (v.tipo === "DEPARTAMENTO" && v.codigo && v.nombre) {
        const existing = await tx.department.findFirst({
          where: { code: { equals: v.codigo, mode: "insensitive" } },
        });
        if (!existing) {
          await tx.department.create({ data: { code: v.codigo, name: v.nombre } });
          created += 1;
        } else {
          await tx.department.update({ where: { id: existing.id }, data: { name: v.nombre } });
          if (result.action === "sin cambios") unchanged += 1;
          else updated += 1;
        }
      } else if (v.tipo === "PLANTA" && v.nombre && v.edificioCodigo) {
        const building = await tx.building.findFirst({
          where: { code: { equals: v.edificioCodigo, mode: "insensitive" } },
        });
        if (!building) {
          errors += 1;
          continue;
        }
        const floors = await tx.floor.findMany({ where: { buildingId: building.id } });
        const existing = floors.find((f) => normKey(f.name) === normKey(v.nombre as string));
        if (!existing) {
          await tx.floor.create({
            data: {
              buildingId: building.id,
              name: v.nombre,
              level: v.nivel ?? 0,
            },
          });
          created += 1;
        } else {
          await tx.floor.update({
            where: { id: existing.id },
            data: { name: v.nombre, level: v.nivel ?? existing.level },
          });
          if (result.action === "sin cambios") unchanged += 1;
          else updated += 1;
        }
      } else if (v.tipo === "DESPACHO" && v.codigo && v.nombre && v.edificioCodigo && v.plantaNombre) {
        const codigo = v.codigo;
        const nombre = v.nombre;
        const edificioCodigo = v.edificioCodigo;
        const plantaNombre = v.plantaNombre;
        const building = await tx.building.findFirst({
          where: { code: { equals: edificioCodigo, mode: "insensitive" } },
        });
        const floors = building ? await tx.floor.findMany({ where: { buildingId: building.id } }) : [];
        const floor = floors.find((f) => normKey(f.name) === normKey(plantaNombre));
        if (!floor) {
          errors += 1;
          continue;
        }
        let departmentId: string | null = null;
        if (v.departamentoCodigo) {
          const department = await tx.department.findFirst({
            where: { code: { equals: v.departamentoCodigo, mode: "insensitive" } },
          });
          departmentId = department?.id ?? null;
        }
        const offices = await tx.office.findMany({ where: { floorId: floor.id } });
        const existing = offices.find((o) => normKey(o.code) === normKey(codigo));
        const rect = (v.rect ?? undefined) as Prisma.InputJsonValue | undefined;
        if (!existing) {
          await tx.office.create({
            data: {
              floorId: floor.id,
              code: codigo,
              name: nombre,
              departmentId,
              rect: (v.rect ?? Prisma.DbNull) as Prisma.InputJsonValue,
            },
          });
          created += 1;
        } else {
          await tx.office.update({
            where: { id: existing.id },
            data: {
              name: nombre,
              departmentId: v.departamentoCodigo ? departmentId : undefined,
              ...(v.rect ? { rect } : {}),
            },
          });
          if (result.action === "sin cambios") unchanged += 1;
          else updated += 1;
        }
      } else {
        errors += 1;
      }
    }
  });

  return { created, updated, unchanged, errors };
}

export async function applyComputerImport(
  results: ComputerRowResult[],
  opts: { omitirErrores: boolean },
): Promise<{ created: number; updated: number; unchanged: number; errors: number }> {
  const prisma = getPrisma();
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  await prisma.$transaction(async (tx) => {
    for (const result of results) {
      if (result.errors.length > 0) {
        errors += 1;
        if (!opts.omitirErrores) {
          throw new Error(`Fila ${result.line} con errores: ${result.errors[0].detail}`);
        }
        continue;
      }
      const v = result.values;
      const credName = v.credentialName;
      const credential = credName
        ? await tx.vncCredential.findUnique({ where: { name: credName } })
        : null;

      const data: PrismaTypes.ComputerUncheckedUpdateInput = {};
      if (v.ip !== undefined) data.ip = v.ip;
      if (v.assignedTo !== undefined) data.assignedTo = v.assignedTo;
      if (v.phoneExt !== undefined) data.phoneExt = v.phoneExt;
      if (v.notes !== undefined) data.notes = v.notes;
      if (v.assetTag !== undefined) data.assetTag = v.assetTag;
      if (v.adUsername !== undefined) data.adUsername = v.adUsername;
      if (v.floorId !== undefined) data.floorId = v.floorId;
      if (v.officeId !== undefined) data.officeId = v.officeId;
      if (v.departmentId !== undefined) data.departmentId = v.departmentId;
      if (v.posX !== undefined) data.posX = v.posX;
      if (v.posY !== undefined) data.posY = v.posY;
      if (v.vncPort !== undefined) data.vncPort = v.vncPort;
      if (credential) data.credentialId = credential.id;

      const existing = await tx.computer.findUnique({ where: { hostname: v.hostname } });
      if (!existing) {
        await tx.computer.create({
          data: {
            hostname: v.hostname,
            source: "CSV",
            ip: v.ip ?? null,
            assignedTo: v.assignedTo ?? null,
            phoneExt: v.phoneExt ?? null,
            notes: v.notes ?? null,
            assetTag: v.assetTag ?? null,
            adUsername: v.adUsername ?? null,
            floorId: v.floorId ?? null,
            officeId: v.officeId ?? null,
            departmentId: v.departmentId ?? null,
            posX: v.posX ?? null,
            posY: v.posY ?? null,
            vncPort: v.vncPort ?? 5900,
            credentialId: credential?.id ?? null,
          },
        });
        created += 1;
      } else if (result.action === "sin cambios") {
        unchanged += 1;
      } else {
        await tx.computer.update({ where: { id: existing.id }, data });
        updated += 1;
      }
    }
  });

  return { created, updated, unchanged, errors };
}
