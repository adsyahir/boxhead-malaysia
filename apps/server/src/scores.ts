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

/** The storage the service needs. D1 implements it in production; tests use memory. */
export interface ScoreStore {
  insert(row: NewScore, ipHash: string | null, now: number): Promise<void>;
  /** Number of rows in this board with a strictly higher score. */
  countHigher(map: MapId, mode: ScoreMode, score: number): Promise<number>;
  top(map: MapId | null, mode: ScoreMode | null, limit: number): Promise<ScoreRow[]>;
  recentFrom(ipHash: string, sinceMs: number): Promise<number>;
}

export const SUBMIT_LIMIT = 5;
export const SUBMIT_WINDOW_MS = 60_000;
export const TEAM_NAME_MAX = 40;

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
});

export type CheckResult = { ok: true; data: NewScore } | { ok: false; reason: string };

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
  };
}

export type SubmitResult = { ok: true; rank: number } | { ok: false; status: 400 | 429; reason: string };

/** Check, rate-limit, store and rank a browser-submitted score. `ipHash` identifies the sender for rate limiting. */
export async function submitScore(store: ScoreStore, body: unknown, ipHash: string, now: number): Promise<SubmitResult> {
  const checked = checkSubmission(body);
  if (!checked.ok) return { ok: false, status: 400, reason: checked.reason };
  if ((await store.recentFrom(ipHash, now - SUBMIT_WINDOW_MS)) >= SUBMIT_LIMIT) return { ok: false, status: 429, reason: "Too many submissions" };
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
