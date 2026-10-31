import type { MapId } from "@kampung/protocol";
import type { NewScore, ScoreMode, ScoreRow, ScoreStore } from "./scores";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    score INTEGER NOT NULL,
    wave INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    level INTEGER NOT NULL,
    map TEXT NOT NULL,
    mode TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    ip_hash TEXT,
    source TEXT NOT NULL DEFAULT 'client'
  )`,
  "CREATE INDEX IF NOT EXISTS scores_board ON scores (map, mode, score DESC)",
  "CREATE INDEX IF NOT EXISTS scores_ip ON scores (ip_hash, created_at)",
];

let schemaReady: Promise<unknown> | null = null;

/** Create the table on first use, so a fresh database needs no manual migration step. Runs once per isolate. */
function ensureSchema(db: D1Database): Promise<unknown> {
  schemaReady ??= db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((e) => {
    schemaReady = null; // try again on the next request
    throw e;
  });
  return schemaReady;
}

interface Row {
  nickname: string;
  score: number;
  wave: number;
  kills: number;
  level: number;
  map: string;
  mode: string;
  duration_ms: number;
  created_at: number;
}

export class D1ScoreStore implements ScoreStore {
  constructor(private readonly db: D1Database) {}

  async insert(row: NewScore, ipHash: string | null, now: number): Promise<void> {
    await ensureSchema(this.db);
    await this.db
      .prepare("INSERT INTO scores (nickname, score, wave, kills, level, map, mode, duration_ms, created_at, ip_hash, source) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(row.nickname, row.score, row.wave, row.kills, row.level, row.map, row.mode, row.durationMs, now, ipHash, row.source)
      .run();
  }

  async countHigher(map: MapId, mode: ScoreMode, score: number): Promise<number> {
    await ensureSchema(this.db);
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM scores WHERE map = ? AND mode = ? AND score > ?").bind(map, mode, score).first<{ n: number }>();
    return r?.n ?? 0;
  }

  async top(map: MapId | null, mode: ScoreMode | null, limit: number): Promise<ScoreRow[]> {
    await ensureSchema(this.db);
    const where: string[] = [];
    const args: unknown[] = [];
    if (map) {
      where.push("map = ?");
      args.push(map);
    }
    if (mode) {
      where.push("mode = ?");
      args.push(mode);
    }
    const sql = `SELECT nickname, score, wave, kills, level, map, mode, duration_ms, created_at FROM scores ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY score DESC, created_at ASC LIMIT ?`;
    const res = await this.db.prepare(sql).bind(...args, limit).all<Row>();
    return (res.results ?? []).map((r) => ({
      nickname: r.nickname,
      score: r.score,
      wave: r.wave,
      kills: r.kills,
      level: r.level,
      map: r.map as MapId,
      mode: r.mode as ScoreMode,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
    }));
  }

  async recentFrom(ipHash: string, sinceMs: number): Promise<number> {
    await ensureSchema(this.db);
    const r = await this.db.prepare("SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?").bind(ipHash, sinceMs).first<{ n: number }>();
    return r?.n ?? 0;
  }
}
