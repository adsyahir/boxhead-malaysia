import type { MapId } from "@kampung/protocol";
import { httpBase } from "./endpoint";

export type BoardMode = "1p" | "2p" | "online";

export interface BoardRow {
  rank: number;
  nickname: string;
  score: number;
  wave: number;
  kills: number;
  level: number;
  map: MapId;
  mode: BoardMode;
  durationMs: number;
  createdAt: number;
}

export type SubmitOutcome = { ok: true; rank: number } | { ok: false; reason: "rate_limited" | "invalid" | "unavailable" };

async function timed(path: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    return await fetch(`${httpBase()}${path}`, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the server for a run ticket when a local run starts. The score must bring it back, and the server only takes
 * it once at least the run's play time has passed. Retries a few times; null if the server cannot be reached.
 */
export async function requestTicket(map: string): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await timed("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ map }) });
      if (res.status === 201) return ((await res.json()) as { ticket: string }).ticket;
      if (res.status === 400) return null;
    } catch {
      /* try again */
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return null;
}

/** Send a finished 1P or 2P run. The server re-checks it; online runs are saved by the room server, never here. */
export async function submitScore(run: {
  nickname: string;
  score: number;
  wave: number;
  kills: number;
  level?: number;
  map: string;
  mode: "1p" | "2p";
  durationMs: number;
  ticket: string;
}): Promise<SubmitOutcome> {
  try {
    const res = await timed("/api/scores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(run) });
    if (res.status === 201) return { ok: true, rank: ((await res.json()) as { rank: number }).rank };
    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    if (res.status === 400 || res.status === 413) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** The top scores for a board, or null if the server could not be reached. */
export async function fetchScores(map: MapId, mode: BoardMode, limit = 50): Promise<BoardRow[] | null> {
  try {
    const res = await timed(`/api/scores?map=${map}&mode=${mode}&limit=${limit}`);
    if (!res.ok) return null;
    return ((await res.json()) as { scores: BoardRow[] }).scores;
  } catch {
    return null;
  }
}
