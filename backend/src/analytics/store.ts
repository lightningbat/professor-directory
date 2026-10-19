import type { Db } from '../db.js';

/** A browser counts as "online" if it sent a heartbeat this recently (the site beats every ~25 s). */
export const ONLINE_WINDOW_MS = 75_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface HeartbeatInput {
  visitorId: string;
  sessionId: string;
  userId: string | null;
  path: string;
}

export interface OnlineCounts {
  visitors: number;
  signedIn: number;
  guests: number;
  sessions: number;
}

export interface OnlineSession {
  sessionId: string;
  visitorId: string;
  kind: 'user' | 'guest';
  user: { id: string; name: string | null; email: string | null; picture: string | null } | null;
  path: string;
  firstSeen: number;
  lastSeen: number;
}

export interface DailyRow {
  day: string;
  uniqueVisitors: number;
  signedIn: number;
  guests: number;
  sessions: number;
  newUsers: number;
}

/**
 * Terms: a *visitor* is one browser (random id kept in localStorage), a *session* is one tab.
 * "Signed in" means the server saw a valid login cookie on the heartbeat, so the browser can't fake it.
 */
export class AnalyticsStore {
  private readonly dayFormat: Intl.DateTimeFormat;
  private readonly upsertSession;
  private readonly upsertVisitorDay;

  constructor(private readonly db: Db, readonly timezone = 'UTC') {
    this.dayFormat = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    });

    this.upsertSession = db.prepare(
      `INSERT INTO presence_sessions (session_id, visitor_id, user_id, path, day, first_seen, last_seen)
       VALUES (@sessionId, @visitorId, @userId, @path, @day, @now, @now)
       ON CONFLICT(session_id) DO UPDATE SET
         visitor_id = excluded.visitor_id, user_id = excluded.user_id,
         path = excluded.path, last_seen = excluded.last_seen`,
    );
    this.upsertVisitorDay = db.prepare(
      `INSERT INTO visitor_days (day, visitor_id, user_id, first_seen)
       VALUES (@day, @visitorId, @userId, @now)
       ON CONFLICT(day, visitor_id) DO UPDATE SET user_id = COALESCE(visitor_days.user_id, excluded.user_id)`,
    );
  }

  /** "YYYY-MM-DD" in the configured timezone. */
  dayKey(ms: number): string {
    return this.dayFormat.format(ms);
  }

  heartbeat(input: HeartbeatInput, now = Date.now()): void {
    const params = { ...input, day: this.dayKey(now), now };
    this.db.transaction(() => {
      this.upsertSession.run(params);
      this.upsertVisitorDay.run(params);
    })();
  }

  onlineCounts(now = Date.now()): OnlineCounts {
    const since = now - ONLINE_WINDOW_MS;
    const people = this.db
      .prepare(
        `SELECT COUNT(*) AS visitors, COALESCE(SUM(signed), 0) AS signedIn FROM (
           SELECT visitor_id, MAX(user_id IS NOT NULL) AS signed
             FROM presence_sessions WHERE last_seen > ? GROUP BY visitor_id)`,
      )
      .get(since) as { visitors: number; signedIn: number };
    const { sessions } = this.db
      .prepare('SELECT COUNT(*) AS sessions FROM presence_sessions WHERE last_seen > ?')
      .get(since) as { sessions: number };
    return { visitors: people.visitors, signedIn: people.signedIn, guests: people.visitors - people.signedIn, sessions };
  }

  /** Which pages the people online right now are looking at. */
  onlinePages(now = Date.now(), limit = 20): Array<{ path: string; visitors: number }> {
    return this.db
      .prepare(
        `SELECT path, COUNT(DISTINCT visitor_id) AS visitors FROM presence_sessions
          WHERE last_seen > ? GROUP BY path ORDER BY visitors DESC, path LIMIT ?`,
      )
      .all(now - ONLINE_WINDOW_MS, limit) as Array<{ path: string; visitors: number }>;
  }

  onlineSessions(kind: 'all' | 'user' | 'guest', limit: number, now = Date.now()): OnlineSession[] {
    const filter = kind === 'user' ? 'AND s.user_id IS NOT NULL' : kind === 'guest' ? 'AND s.user_id IS NULL' : '';
    const rows = this.db
      .prepare(
        `SELECT s.session_id, s.visitor_id, s.user_id, s.path, s.first_seen, s.last_seen,
                u.name, u.email, u.picture
           FROM presence_sessions s LEFT JOIN users u ON u.id = s.user_id
          WHERE s.last_seen > ? ${filter}
          ORDER BY s.last_seen DESC LIMIT ?`,
      )
      .all(now - ONLINE_WINDOW_MS, limit) as Array<{
        session_id: string; visitor_id: string; user_id: string | null; path: string;
        first_seen: number; last_seen: number; name: string | null; email: string | null; picture: string | null;
      }>;

    return rows.map((r) => ({
      sessionId: r.session_id,
      visitorId: r.visitor_id,
      kind: r.user_id ? 'user' : 'guest',
      user: r.user_id ? { id: r.user_id, name: r.name, email: r.email, picture: r.picture } : null,
      path: r.path,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    }));
  }

  recordSnapshot(now = Date.now()): void {
    const ts = Math.floor(now / MINUTE_MS) * MINUTE_MS;
    const c = this.onlineCounts(now);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO online_snapshots (ts, day, visitors, signed_in, guests, sessions)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(ts, this.dayKey(ts), c.visitors, c.signedIn, c.guests, c.sessions);
  }

  /**
   * Peak concurrent visitors per bucket (the snapshot with the most people in that bucket).
   * The CASTs matter: better-sqlite3 binds JS numbers as floats, which would turn the integer
   * division that rounds timestamps down to a bucket into a plain division.
   */
  timeline(rangeMs: number, bucketMs: number, now = Date.now()) {
    return this.db
      .prepare(
        `SELECT (ts / CAST(@bucket AS INTEGER)) * CAST(@bucket AS INTEGER) AS t, MAX(visitors) AS visitors, signed_in AS signedIn, guests
           FROM online_snapshots WHERE ts >= @since GROUP BY t ORDER BY t`,
      )
      .all({ bucket: bucketMs, since: now - rangeMs }) as Array<{ t: number; visitors: number; signedIn: number; guests: number }>;
  }

  today(now = Date.now()) {
    const day = this.dayKey(now);
    const uv = this.db
      .prepare('SELECT COUNT(*) AS uniqueVisitors, COALESCE(SUM(user_id IS NOT NULL), 0) AS signedIn FROM visitor_days WHERE day = ?')
      .get(day) as { uniqueVisitors: number; signedIn: number };
    const { sessions } = this.db
      .prepare('SELECT COUNT(*) AS sessions FROM presence_sessions WHERE day = ?')
      .get(day) as { sessions: number };
    const { peak } = this.db
      .prepare('SELECT COALESCE(MAX(visitors), 0) AS peak FROM online_snapshots WHERE day = ?')
      .get(day) as { peak: number };
    const newUsers = this.newUsersByDay(now - 2 * DAY_MS).get(day) ?? 0;

    return {
      day,
      uniqueVisitors: uv.uniqueVisitors,
      signedIn: uv.signedIn,
      guests: uv.uniqueVisitors - uv.signedIn,
      sessions,
      peakOnline: Math.max(peak, this.onlineCounts(now).visitors),
      newUsers,
    };
  }

  daily(days: number, now = Date.now()): DailyRow[] {
    const today = this.dayKey(now);
    // Plain calendar arithmetic on the day key, so daylight-saving shifts can't skip or repeat a day.
    const keys: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      keys.push(new Date(Date.parse(`${today}T00:00:00Z`) - i * DAY_MS).toISOString().slice(0, 10));
    }
    const first = keys[0]!;

    const visitors = new Map(
      (this.db
        .prepare(
          `SELECT day, COUNT(*) AS uv, COALESCE(SUM(user_id IS NOT NULL), 0) AS si
             FROM visitor_days WHERE day >= ? GROUP BY day`,
        )
        .all(first) as Array<{ day: string; uv: number; si: number }>).map((r) => [r.day, r]),
    );
    const sessions = new Map(
      (this.db
        .prepare('SELECT day, COUNT(*) AS n FROM presence_sessions WHERE day >= ? GROUP BY day')
        .all(first) as Array<{ day: string; n: number }>).map((r) => [r.day, r.n]),
    );
    const signups = this.newUsersByDay(now - (days + 1) * DAY_MS);

    return keys.map((day) => {
      const v = visitors.get(day);
      return {
        day,
        uniqueVisitors: v?.uv ?? 0,
        signedIn: v?.si ?? 0,
        guests: (v?.uv ?? 0) - (v?.si ?? 0),
        sessions: sessions.get(day) ?? 0,
        newUsers: signups.get(day) ?? 0,
      };
    });
  }

  totalUsers(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  revealsSince(ms: number): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM email_reveals WHERE created_at > ?').get(ms) as { n: number }).n;
  }

  purge(retentionDays: number, now = Date.now()): void {
    const cutoff = now - retentionDays * DAY_MS;
    const cutoffDay = this.dayKey(cutoff);
    this.db.prepare('DELETE FROM presence_sessions WHERE last_seen < ?').run(cutoff);
    this.db.prepare('DELETE FROM visitor_days WHERE day < ?').run(cutoffDay);
    this.db.prepare('DELETE FROM online_snapshots WHERE ts < ?').run(cutoff);
  }

  private newUsersByDay(sinceMs: number): Map<string, number> {
    const rows = this.db.prepare('SELECT created_at FROM users WHERE created_at >= ?').all(sinceMs) as Array<{ created_at: number }>;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = this.dayKey(r.created_at);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }
}
