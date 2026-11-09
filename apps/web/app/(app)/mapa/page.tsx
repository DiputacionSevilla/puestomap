import { getPrisma } from "@puestomap/db";
import { deriveUserMatch, deriveVncState, type VncUiState } from "@puestomap/shared";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FloorMapDynamic } from "@/components/map/floor-map-dynamic";
import type { MapComputer, MapOffice } from "@/components/map/floor-map";
import { MapFloorSwitcher } from "@/components/map/map-floor-switcher";

export const dynamic = "force-dynamic";

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  const prisma = getPrisma();

  const buildings = await prisma.building.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      floors: {
        orderBy: { level: "asc" },
        select: {
          id: true,
          name: true,
          level: true,
          buildingId: true,
          planFile: true,
          planWidth: true,
          planHeight: true,
        },
      },
    },
  });

  let floorId = params.floorId;
  if (params.focus) {
    const focused = await prisma.computer.findUnique({
      where: { id: params.focus },
      select: { floorId: true },
    });
    if (focused?.floorId) floorId = focused.floorId;
  }

  const allFloors = buildings.flatMap((b) => b.floors);
  const floor =
    allFloors.find((f) => f.id === floorId) ??
    allFloors.find((f) => f.planFile !== null) ??
    allFloors[0];

  if (!floor) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Mapa</h1>
        <p className="text-sm text-muted-foreground">
          No hay plantas definidas. Crea edificios y plantas en Estructura.
        </p>
      </div>
    );
  }
  const building = buildings.find((b) => b.id === floor.buildingId) ?? buildings[0];

  const [rows, unplacedRows, departments, offices] = await Promise.all([
    prisma.computer.findMany({
      where: { floorId: floor.id, archived: false },
      orderBy: { hostname: "asc" },
    }),
    prisma.computer.findMany({
      where: {
        archived: false,
        OR: [{ floorId: null }, { posX: null }, { posY: null }],
      },
      orderBy: { hostname: "asc" },
      take: 300,
    }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.office.findMany({
      where: { floorId: floor.id },
      orderBy: { code: "asc" },
    }),
  ]);

  const adUsernames = [...rows, ...unplacedRows]
    .map((r) => r.adUsername)
    .filter((u): u is string => Boolean(u));
  const directory = adUsernames.length
    ? await prisma.directoryUser.findMany({
        where: { username: { in: Array.from(new Set(adUsernames)) } },
        select: { username: true, displayName: true },
      })
    : [];
  const directoryNames = new Map(directory.map((d) => [d.username, d.displayName]));

  const toMapComputer = (row: (typeof rows)[number]): MapComputer => ({
    id: row.id,
    hostname: row.hostname,
    ip: row.ip,
    lastUser: row.lastUser,
    lastUserNorm: row.lastUserNorm,
    adUsername: row.adUsername,
    assignedTo: row.assignedTo,
    posX: row.posX,
    posY: row.posY,
    state: deriveVncState({
      online: row.online,
      vncReachable: row.vncReachable,
      vncInstalled: row.vncInstalled,
      vncOverride: row.vncOverride,
    }) as VncUiState,
    userMatch: deriveUserMatch(row),
    directoryName: row.adUsername ? (directoryNames.get(row.adUsername) ?? null) : null,
    monitorCount: row.monitorCount,
    officeId: row.officeId,
    departmentId: row.departmentId,
  });

  const computers = rows.filter((r) => r.posX != null && r.posY != null).map(toMapComputer);
  const unplaced = unplacedRows.map(toMapComputer);

  const officesWithCount: MapOffice[] = offices.map((office) => ({
    id: office.id,
    code: office.code,
    name: office.name,
    departmentId: office.departmentId,
    rect: (office.rect as unknown as MapOffice["rect"]) ?? null,
    computerCount: rows.filter((r) => r.officeId === office.id).length,
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Mapa</h1>
        <MapFloorSwitcher
          buildings={buildings.map((b) => ({
            id: b.id,
            name: b.name,
            floors: b.floors.map((f) => ({ id: f.id, name: f.name, level: f.level })),
          }))}
          buildingId={building.id}
          floorId={floor.id}
        />
      </div>
      <FloorMapDynamic
        floorId={floor.id}
        floorName={floor.name}
        buildingName={building.name}
        planWidth={floor.planWidth ?? 1200}
        planHeight={floor.planHeight ?? 800}
        planUrl={floor.planFile ? `/api/floors/${floor.id}/plan` : null}
        initialComputers={computers}
        offices={officesWithCount}
        departments={departments}
        canEdit={session.user.role !== "VIEWER"}
        focusId={params.focus ?? null}
        unplaced={unplaced}
      />
    </div>
  );
}
