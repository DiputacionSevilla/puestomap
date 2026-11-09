import type { PrismaClient } from "@puestomap/db";
import { describe, expect, it, vi } from "vitest";
import type { OcsClient } from "../src/ocs/client.js";
import { mapOcsComputer } from "../src/ocs/mapper.js";
import { runOcsSync } from "../src/sync/ocs.js";

function prismaMock(options: { lastSync?: string; current?: Record<string, unknown> | null }) {
  const syncRunUpdate = vi.fn().mockResolvedValue({});
  const settingUpsert = vi.fn().mockResolvedValue({});
  const computerCreate = vi.fn().mockResolvedValue({});
  const computerUpdate = vi.fn().mockResolvedValue({});
  const computerFindUnique = vi.fn()
    .mockResolvedValueOnce(options.current ?? null)
    .mockResolvedValueOnce(options.current ?? null);
  const prisma = {
    syncRun: {
      create: vi.fn().mockResolvedValue({ id: "run-1" }),
      update: syncRunUpdate,
    },
    setting: {
      findUnique: vi.fn().mockResolvedValue(options.lastSync ? { value: options.lastSync } : null),
      upsert: settingUpsert,
    },
    computer: {
      findUnique: computerFindUnique,
      create: computerCreate,
      update: computerUpdate,
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  } as unknown as PrismaClient;
  return { prisma, syncRunUpdate, settingUpsert, computerCreate, computerUpdate };
}

describe("runOcsSync (T-21)", () => {
  it("hace una primera sincronización completa y crea el equipo", async () => {
    const detail = { hardware: { ID: 4, NAME: "PC-04", LASTDATE: "2026-11-09T10:00:00Z" }, softwares: [] };
    const client: OcsClient = {
      listComputerIds: vi.fn().mockResolvedValue([4]),
      getComputer: vi.fn().mockResolvedValue(detail),
    };
    const mocks = prismaMock({});
    const stats = await runOcsSync({ prisma: mocks.prisma, client, now: new Date("2026-11-09T12:00:00Z") });

    expect(client.listComputerIds).toHaveBeenCalledWith(undefined);
    expect(mocks.computerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ocsId: 4, hostname: "PC-04", source: "OCS" }),
    }));
    expect(stats).toEqual({ created: 1, updated: 0, unchanged: 0, errors: 0 });
    expect(mocks.settingUpsert).toHaveBeenCalled();
  });

  it("usa lastupdate con una hora de margen y cuenta equipos sin cambios", async () => {
    const detail = {
      hardware: { ID: 5, NAME: "PC-05", LASTDATE: "2026-11-09T10:00:00Z" },
      softwares: [{ NAME: "TightVNC", VERSION: "2.8" }],
    };
    const mapped = mapOcsComputer(detail);
    const client: OcsClient = {
      listComputerIds: vi.fn().mockResolvedValue([5]),
      getComputer: vi.fn().mockResolvedValue(detail),
    };
    const mocks = prismaMock({
      lastSync: "2026-11-09T11:00:00Z",
      current: { id: "computer-5", ...mapped, lastVncOkAt: null },
    });
    const stats = await runOcsSync({ prisma: mocks.prisma, client, now: new Date("2026-11-09T12:00:00Z") });

    expect(client.listComputerIds).toHaveBeenCalledWith(7200);
    expect(mocks.computerUpdate).not.toHaveBeenCalled();
    expect(stats.unchanged).toBe(1);
  });
});
