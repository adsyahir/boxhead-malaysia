import { BALANCE, movePlayer, type MapData, type Vec, type Walker } from "@kampung/game-core";

export const PREDICT = {
  /** A correction bigger than this (px) is a teleport (revive, respawn): snap to the server at once. */
  snapPx: 80,
  /** Smaller errors are blended in: this fraction of the error each snapshot (20 per second). */
  blend: 0.2,
  /** The server applies an input a little after it receives it. */
  reconcileLagMs: 16,
  historyMs: 1500,
  sentKeep: 300,
  maxCatchUpMs: 250,
} as const;

interface Sample {
  t: number;
  x: number;
  y: number;
}

/**
 * Client-side prediction for your own hero. It moves the hero locally with the very same movement code the server
 * runs, so the hero reacts the instant you press a key instead of one network round trip later. Each snapshot
 * carries the server's position and the last input it has applied (`ack`); we compare with where we were at that
 * moment and correct the difference gently (or snap, for a teleport).
 * Time is passed in, so it is deterministic and testable.
 */
export class Predictor {
  active = false;
  readonly body: Walker = { x: 0, y: 0, radius: BALANCE.playerRadius, facing: { x: 1, y: 0 } };
  /** For debugging and tests. */
  readonly stats = { reconciles: 0, lastError: 0, maxError: 0, snaps: 0 };

  private lastMs = 0;
  private acc = 0;
  private history: Sample[] = [];
  private readonly sent = new Map<number, number>();

  constructor(private readonly map: MapData) {}

  reset(x: number, y: number, facing: Vec, nowMs: number): void {
    this.body.x = x;
    this.body.y = y;
    this.body.facing = { ...facing };
    this.active = true;
    this.lastMs = nowMs;
    this.acc = 0;
    this.history = [{ t: nowMs, x, y }];
    this.sent.clear();
  }

  deactivate(): void {
    this.active = false;
  }

  /** Advance the local hero to `nowMs` with the current sticks, in the same fixed 60 Hz steps the server uses. */
  step(moveX: number, moveY: number, nowMs: number, aimX = 0, aimY = 0): void {
    if (!this.active) return;
    this.acc += Math.min(Math.max(0, nowMs - this.lastMs), PREDICT.maxCatchUpMs);
    this.lastMs = nowMs;
    const stepMs = BALANCE.dt * 1000;
    while (this.acc >= stepMs) {
      movePlayer(this.map, this.body, moveX, moveY, BALANCE.dt, aimX, aimY);
      this.acc -= stepMs;
    }
    this.history.push({ t: nowMs, x: this.body.x, y: this.body.y });
    const cutoff = nowMs - PREDICT.historyMs;
    while (this.history.length > 2 && this.history[0]!.t < cutoff) this.history.shift();
  }

  /** Remember when input number `seq` was sent, so a later `ack` of it can be matched to our own history. */
  recordSent(seq: number, nowMs: number): void {
    this.sent.set(seq, nowMs);
    if (this.sent.size > PREDICT.sentKeep) this.sent.delete(this.sent.keys().next().value as number);
  }

  /** Where we were at client time `t` (interpolated between the recorded steps). */
  private at(t: number): Sample {
    const h = this.history;
    if (t <= h[0]!.t) return h[0]!;
    const last = h[h.length - 1]!;
    if (t >= last.t) return last;
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1]!;
      const b = h[i]!;
      if (t >= a.t) {
        const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
        return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return h[0]!;
  }

  /** Apply one server snapshot of our own hero. Returns whether the local hero should be shown (prediction is on). */
  reconcile(server: { x: number; y: number; alive: boolean; ack?: number }, facing: Vec, nowMs: number): boolean {
    if (!server.alive) {
      this.active = false; // downed or away: the server decides where we are
      return false;
    }
    if (!this.active) {
      this.reset(server.x, server.y, facing, nowMs);
      return true;
    }
    const sentAt = server.ack ? this.sent.get(server.ack) : undefined;
    if (sentAt === undefined) return true; // nothing to compare against yet

    const past = this.at(sentAt + PREDICT.reconcileLagMs);
    const ex = server.x - past.x;
    const ey = server.y - past.y;
    const err = Math.hypot(ex, ey);
    this.stats.reconciles++;
    this.stats.lastError = err;
    this.stats.maxError = Math.max(this.stats.maxError, err);

    const k = err > PREDICT.snapPx ? 1 : PREDICT.blend;
    if (k === 1) this.stats.snaps++;
    const dx = ex * k;
    const dy = ey * k;
    this.body.x += dx;
    this.body.y += dy;
    // keep the recorded trajectory consistent, so the same error is not corrected twice
    for (const s of this.history) {
      s.x += dx;
      s.y += dy;
    }
    return true;
  }
}
