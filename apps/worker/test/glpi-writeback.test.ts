import type { PrismaClient } from "@puestomap/db";
import { describe, expect, it, vi } from "vitest";
import type { GlpiApi, GlpiClient } from "../src/glpi/client.js";
import { buildLocationUpdate, flushLocationWrites } from "../src/glpi/writeback.js";

function fake(pending: Record<string, unknown>[], put: GlpiApi["put"]) {
  const update = vi.fn().mockResolvedValue({});
  const create = vi.fn().mockResolvedValue({});
  const prisma = {
    computer: { findMany: vi.fn().mockResolvedValue(pending), update },
    auditLog: { create },
  } as unknown as PrismaClient;
  const client: GlpiClient = { withSession: (fn) => fn({ put } as unknown as GlpiApi) };
  return { prisma, client, update, create };
}

describe("escritura de ubicación a GLPI (T-I10)", () => {
  it("solo envía locations_id", () => {
    expect(buildLocationUpdate(7, 22)).toEqual({ path: "Computer/7", body: { input: { locations_id: 22 } } });
  });
  it("envía, limpia el pendiente y audita", async () => {
    const put = vi.fn().mockResolvedValue({});
    const { prisma, client, update, create } = fake([{ id: "c1", hostname: "PC-A", glpiId: 7, glpiLocationTarget: 22 }], put);
    expect(await flushLocationWrites(prisma, client)).toEqual({ sent: 1, failed: 0 });
    expect(put).toHaveBeenCalledWith("Computer/7", { input: { locations_id: 22 } });
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { glpiLocationTarget: null } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "computer.glpi_location" }) }));
  });
  it("si GLPI falla, el pendiente se conserva para reintentar", async () => {
    const put = vi.fn().mockRejectedValue(new Error("GLPI caído"));
    const { prisma, client, update } = fake([{ id: "c1", hostname: "PC-A", glpiId: 7, glpiLocationTarget: 22 }], put);
    expect(await flushLocationWrites(prisma, client)).toEqual({ sent: 0, failed: 1 });
    expect(update).not.toHaveBeenCalled();
  });
  it("sin pendientes no abre sesión", async () => {
    const withSession = vi.fn();
    const prisma = { computer: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
    await flushLocationWrites(prisma, { withSession } as unknown as GlpiClient);
    expect(withSession).not.toHaveBeenCalled();
  });
});
