import pg from "pg";
import type { SessionClaim, SessionStats, SessionStore } from "./session-store.js";

export class PgSessionStore implements SessionStore {
  constructor(private pool: pg.Pool) {}

  async claim(sid: string, meta: { clientIp: string | null }): Promise<SessionClaim | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE "RemoteSession"
            SET status = 'ACTIVE', "startedAt" = now(), "clientIp" = $2
          WHERE id = $1
            AND status = 'PENDING'
            AND "createdAt" > now() - interval '60 seconds'
          RETURNING id`,
        [sid, meta.clientIp],
      );
      if ((updated.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const row = await client.query(
        `SELECT COALESCE(s."targetPort", c."vncPort") AS "targetPort", c.ip, c.hostname
           FROM "RemoteSession" s
           JOIN "Computer" c ON c.id = s."computerId"
          WHERE s.id = $1`,
        [sid],
      );
      await client.query("COMMIT");
      const data = row.rows[0];
      return {
        targetIp: data?.ip ?? null,
        targetHostname: data?.hostname ?? "",
        targetPort: Number(data?.targetPort ?? 5900),
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async finish(sid: string, stats: SessionStats): Promise<void> {
    await this.pool.query(
      `UPDATE "RemoteSession"
          SET status = $2,
              "endedAt" = now(),
              "bytesIn" = $3,
              "bytesOut" = $4,
              "endReason" = $5,
              "targetIp" = COALESCE($6, "targetIp"),
              "resolvedBy" = $7
        WHERE id = $1`,
      [
        sid,
        stats.failed ? "FAILED" : "ENDED",
        stats.bytesIn,
        stats.bytesOut,
        stats.endReason,
        stats.targetIp,
        stats.resolvedBy,
      ],
    );
  }
}
