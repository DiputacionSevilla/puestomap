export type SessionClaim = {
  targetIp: string | null;
  targetHostname: string;
  targetPort: number;
};

export type SessionStats = {
  bytesIn: number;
  bytesOut: number;
  endReason: string;
  failed: boolean;
  targetIp: string | null;
  resolvedBy: string | null;
};

export interface SessionStore {
  claim(sid: string, meta: { clientIp: string | null }): Promise<SessionClaim | null>;
  finish(sid: string, stats: SessionStats): Promise<void>;
}

export class MemorySessionStore implements SessionStore {
  private pending = new Map<string, SessionClaim>();
  finished = new Map<string, SessionStats>();

  seed(sid: string, claim: SessionClaim) {
    this.pending.set(sid, claim);
  }

  async claim(sid: string): Promise<SessionClaim | null> {
    const claim = this.pending.get(sid);
    if (!claim) return null;
    this.pending.delete(sid);
    return claim;
  }

  async finish(sid: string, stats: SessionStats): Promise<void> {
    this.finished.set(sid, stats);
  }
}
