import { MAX_LEVEL, levelForKills, validateNickname, validateRun } from "@kampung/game-core";
import { MAP_IDS, type MapId } from "@kampung/protocol";
import { z } from "zod";

export const SCORE_MODES = ["1p", "2p", "online"] as const;
export type ScoreMode = (typeof SCORE_MODES)[number];

/** One leaderboard row as the API returns it. */
export interface ScoreRow {
  nickname: string;
  score: number;
  wave: number;
  kills: number;
  level: number;
  map: MapId;
  mode: ScoreMode;
  durationMs: number;
  createdAt: number;
}

export interface NewScore extends Omit<ScoreRow, "createdAt"> {
  /** Who vouches for it: the browser (checked by validateRun) or the room server (it ran the game itself). */
  source: "client" | "server";
}

/** Where a submission came from, as Cloudflare saw it. Kept private: never returned by the public API. */
export interface SubmitTrace {
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  /** Network operator (autonomous system) number and name, e.g. 4788 / "TM Net". */
  asn: number | null;
  asOrg: string | null;
  /** Cloudflare data centre that handled the request, e.g. "KUL". */
  colo: string | null;
  userAgent: string | null;
}

/** One row of the private submission log: every attempt, stored or rejected, with the reason. */
export interface SubmissionLog extends SubmitTrace {
  at: number;
  nickname: string | null;
  score: number | null;
  outcome: "stored" | "invalid" | "rate_limited";
  reason: string | null;
}

/** How long the private submission log keeps a row. */
export const SUBMISSION_LOG_DAYS = 90;

/** The storage the service needs. D1 implements it in production; tests use memory. */
export interface ScoreStore {
  insert(row: NewScore, ipHash: string | null, now: number): Promise<void>;
  /** Number of rows in this board with a strictly higher score. */
  countHigher(map: MapId, mode: ScoreMode, score: number): Promise<number>;
  top(map: MapId | null, mode: ScoreMode | null, limit: number): Promise<ScoreRow[]>;
  recentFrom(ipHash: string, sinceMs: number): Promise<number>;
  logSubmission(entry: SubmissionLog): Promise<void>;
  /** Store a new run ticket. */
  addTicket(id: string, map: MapId, ipHash: string, now: number): Promise<void>;
  /** Tickets this sender asked for since `sinceMs`. */
  recentTickets(ipHash: string, sinceMs: number): Promise<number>;
  /** Mark a ticket used and return when it was issued and for which map; null if unknown or already used. Must be atomic. */
  useTicket(id: string, now: number): Promise<{ issuedAt: number; map: MapId } | null>;
}

export const SUBMIT_LIMIT = 5;
export const SUBMIT_WINDOW_MS = 60_000;
export const TEAM_NAME_MAX = 40;

/**
 * Run tickets: the game asks for one when a run starts, and the score must bring it back. A ticket works once, for
 * one map, and only after at least the run's claimed play time has really passed since it was issued.
 */
export const TICKET_LIMIT = 30;
export const TICKET_WINDOW_MS = 60_000;
/** Allowance for the ticket request arriving a moment after the run started. */
export const TICKET_SLACK_MS = 3_000;
export const TICKET_MAX_AGE_MS = 12 * 3600 * 1000;
const TICKET_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const int = z.number().int();

/** What a browser may send. Online scores are never accepted from a browser: the room server saves those. */
export const SubmissionSchema = z.object({
  nickname: z.string().max(40),
  score: int.min(0).max(100_000_000),
  wave: int.min(0).max(1000),
  kills: int.min(0).max(100_000),
  level: int.min(1).max(MAX_LEVEL).optional(),
  map: z.enum(MAP_IDS),
  mode: z.enum(["1p", "2p"]),
  durationMs: int.min(0).max(24 * 3600 * 1000),
  /** The run ticket from POST /api/runs. */
  ticket: z.string().regex(TICKET_RE),
});

export const TicketRequestSchema = z.object({ map: z.enum(MAP_IDS) });

export type CheckResult = { ok: true; data: NewScore; ticket: string } | { ok: false; reason: string };

/**
 * Everything a score must pass before it is stored: shape, nickname rules, the anti-cheat limits that live in
 * game-core (so they always match the real balance numbers), and a level that agrees with the kills.
 */
export function checkSubmission(body: unknown): CheckResult {
  const parsed = SubmissionSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: "Malformed score" };
  const b = parsed.data;

  const nickname = b.nickname;
  const nick = validateNickname(nickname);
  if (!nick.ok) return { ok: false, reason: nick.reason };

  if (b.score < 1) return { ok: false, reason: "Empty run" };
  const wave = Math.max(1, b.wave);
  const run = validateRun({ score: b.score, wave, kills: b.kills, durationMs: b.durationMs });
  if (!run.ok) return { ok: false, reason: run.reason };

  // The level is a pure function of kills, so a client cannot claim a different one.
  const level = levelForKills(b.kills);
  if (b.level !== undefined && b.level !== level) return { ok: false, reason: "Level does not match kills" };

  return {
    ok: true,
    data: { nickname, score: b.score, wave, kills: b.kills, level, map: b.map, mode: b.mode, durationMs: b.durationMs, source: "client" },
    ticket: b.ticket,
  };
}

export type SubmitResult = { ok: true; rank: number } | { ok: false; status: 400 | 429; reason: string };

/**
 * Check, rate-limit, store and rank a browser-submitted score. `ipHash` identifies the sender for rate limiting;
 * `trace` (when given) records the attempt, whatever the outcome, in the private submission log.
 */
export async function submitScore(
  store: ScoreStore,
  body: unknown,
  ipHash: string,
  now: number,
  trace?: SubmitTrace,
  /** Set when the request was already refused (e.g. not from a browser): only log it. */
  refused?: string,
): Promise<SubmitResult> {
  const result: SubmitResult = refused ? { ok: false, status: 400, reason: refused } : await decide(store, body, ipHash, now);
  if (trace) {
    const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    const entry: SubmissionLog = {
      ...trace,
      at: now,
      nickname: typeof b.nickname === "string" ? b.nickname.slice(0, 40) : null,
      score: typeof b.score === "number" && Number.isFinite(b.score) ? b.score : null,
      outcome: result.ok ? "stored" : result.status === 429 ? "rate_limited" : "invalid",
      reason: result.ok ? null : result.reason,
    };
    try {
      await store.logSubmission(entry);
    } catch {
      /* the log is best effort: never fail a real submission because of it */
    }
  }
  return result;
}

async function decide(store: ScoreStore, body: unknown, ipHash: string, now: number): Promise<SubmitResult> {
  const checked = checkSubmission(body);
  if (!checked.ok) return { ok: false, status: 400, reason: checked.reason };
  if ((await store.recentFrom(ipHash, now - SUBMIT_WINDOW_MS)) >= SUBMIT_LIMIT) return { ok: false, status: 429, reason: "Too many submissions" };
  // The ticket is used up even when the checks below fail: one try per run.
  const t = await store.useTicket(checked.ticket, now);
  if (!t) return { ok: false, status: 400, reason: "Unknown or used ticket" };
  if (t.map !== checked.data.map) return { ok: false, status: 400, reason: "Ticket is for another map" };
  const elapsed = now - t.issuedAt;
  if (elapsed > TICKET_MAX_AGE_MS) return { ok: false, status: 400, reason: "Ticket expired" };
  if (elapsed + TICKET_SLACK_MS < checked.data.durationMs) return { ok: false, status: 400, reason: "Sent sooner than the run could have lasted" };
  await store.insert(checked.data, ipHash, now);
  return { ok: true, rank: (await store.countHigher(checked.data.map, checked.data.mode, checked.data.score)) + 1 };
}

/** The room server vouches for these: it ran the game itself, so only sanity limits apply. Returns the rank, or null if not stored. */
export async function saveOnlineScore(
  store: ScoreStore,
  run: { score: number; wave: number; kills: number; durationMs: number; map: MapId },
  names: string[],
  now: number,
): Promise<number | null> {
  if (run.score < 1) return null;
  const team = names.join(" & ").slice(0, TEAM_NAME_MAX) || "Pasukan";
  const row: NewScore = {
    nickname: team,
    score: run.score,
    wave: Math.max(1, run.wave),
    kills: run.kills,
    level: levelForKills(run.kills),
    map: run.map,
    mode: "online",
    durationMs: run.durationMs,
    source: "server",
  };
  await store.insert(row, null, now);
  return (await store.countHigher(row.map, row.mode, row.score)) + 1;
}

export const QuerySchema = z.object({
  map: z.enum(MAP_IDS).optional(),
  mode: z.enum(SCORE_MODES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type TicketResult = { ok: true; ticket: string } | { ok: false; status: 400 | 429; reason: string };

/** Hand out a run ticket for a starting 1P run. `newId` makes the random id (crypto.randomUUID in the Worker). */
export async function issueTicket(store: ScoreStore, body: unknown, ipHash: string, now: number, newId: () => string): Promise<TicketResult> {
  const parsed = TicketRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, reason: "Malformed request" };
  if ((await store.recentTickets(ipHash, now - TICKET_WINDOW_MS)) >= TICKET_LIMIT) return { ok: false, status: 429, reason: "Too many runs" };
  const id = newId();
  await store.addTicket(id, parsed.data.map, ipHash, now);
  return { ok: true, ticket: id };
}
