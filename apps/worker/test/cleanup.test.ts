import type { PrismaClient } from "@puestomap/db";
import { describe, expect, it, vi } from "vitest";
import { cleanupStaleSessions } from "../src/cleanup.js";

describe("cleanupStaleSessions (T-22)", () => {
  it("expira PENDING a 2 min y termina ACTIVE a 4 h", async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      remoteSession: { updateMany },
      $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    } as unknown as PrismaClient;
    const now = new Date("2026-11-09T12:00:00Z");

    await expect(cleanupStaleSessions(prisma, now)).resolves.toEqual({ expired: 2, ended: 1 });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { status: "PENDING", createdAt: { lt: new Date("2026-11-09T11:58:00Z") } },
      data: { status: "EXPIRED", endedAt: now, endReason: "expired" },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { status: "ACTIVE", startedAt: { lt: new Date("2026-11-09T08:00:00Z") } },
      data: { status: "ENDED", endedAt: now, endReason: "stale" },
    });
  });
});
