import type { Db } from '../db.js';

export const REVEAL_LIMITS = {
  userPerHour: 15,
  userPerDay: 50,
  ipPerHour: 30,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type LimitName = 'user_hourly' | 'user_daily' | 'ip_hourly';

export type ConsumeResult =
  | { allowed: true; remaining: { hour: number; day: number } }
  | { allowed: false; limit: LimitName; retryAfterSeconds: number };

interface Rule { name: LimitName; column: 'user_id' | 'ip'; windowMs: number; max: number }

/**
 * Sliding-window limiter backed by the email_reveals table (one row per reveal).
 * The check and the insert run in one synchronous transaction, so concurrent requests
 * can't both squeeze under the limit. Windows are rolling, not calendar hours/days.
 *
 * SQLite is a single-node store: if you run several API instances, move this to Redis.
 */
export class RevealLimiter {
  constructor(private readonly db: Db) {}

  consume(input: { userId: string; ip: string; professorId: string }, now = Date.now()): ConsumeResult {
    const rules: Array<Rule & { value: string }> = [
      { name: 'user_hourly', column: 'user_id', windowMs: HOUR_MS, max: REVEAL_LIMITS.userPerHour, value: input.userId },
      { name: 'user_daily', column: 'user_id', windowMs: DAY_MS, max: REVEAL_LIMITS.userPerDay, value: input.userId },
      { name: 'ip_hourly', column: 'ip', windowMs: HOUR_MS, max: REVEAL_LIMITS.ipPerHour, value: input.ip },
    ];

    return this.db.transaction((): ConsumeResult => {
      const counts = rules.map((r) => this.count(r.column, r.value, now - r.windowMs));

      // If several limits are hit, the caller has to wait for the slowest one to clear.
      let blocked: { name: LimitName; retryMs: number } | null = null;
      rules.forEach((r, i) => {
        const count = counts[i]!;
        if (count < r.max) return;
        const retryMs = this.retryAfterMs(r, count, now);
        if (!blocked || retryMs > blocked.retryMs) blocked = { name: r.name, retryMs };
      });
      if (blocked) {
        const b = blocked as { name: LimitName; retryMs: number };
        return { allowed: false, limit: b.name, retryAfterSeconds: Math.max(1, Math.ceil(b.retryMs / 1000)) };
      }

      this.db
        .prepare('INSERT INTO email_reveals (user_id, ip, professor_id, created_at) VALUES (?, ?, ?, ?)')
        .run(input.userId, input.ip, input.professorId, now);

      const [userHour, userDay, ipHour] = counts as [number, number, number];
      return {
        allowed: true,
        remaining: {
          hour: Math.min(REVEAL_LIMITS.userPerHour - userHour - 1, REVEAL_LIMITS.ipPerHour - ipHour - 1),
          day: REVEAL_LIMITS.userPerDay - userDay - 1,
        },
      };
    })();
  }

  purgeOlderThanDay(now = Date.now()): number {
    return this.db.prepare('DELETE FROM email_reveals WHERE created_at <= ?').run(now - DAY_MS).changes;
  }

  private count(column: Rule['column'], value: string, since: number): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM email_reveals WHERE ${column} = ? AND created_at > ?`)
      .get(value, since) as { n: number };
    return row.n;
  }

  /** The reveal that has to age out of the window before one more slot opens up. */
  private retryAfterMs(rule: Rule & { value: string }, count: number, now: number): number {
    const row = this.db
      .prepare(
        `SELECT created_at FROM email_reveals WHERE ${rule.column} = ? AND created_at > ?
         ORDER BY created_at ASC LIMIT 1 OFFSET ?`,
      )
      .get(rule.value, now - rule.windowMs, count - rule.max) as { created_at: number };
    return row.created_at + rule.windowMs - now;
  }
}
