import type { GameEvent } from "@kampung/game-core";
import { interpolate, type Snapshot } from "./snapshot";

interface Frame {
  at: number;
  snap: Snapshot;
  events: GameEvent[];
}

export interface Sampled {
  snap: Snapshot;
  /** Events of every snapshot the playhead has passed since the last call. Each event is delivered exactly once. */
  events: GameEvent[];
}

const MAX_QUEUE = 12;

/**
 * Plays snapshots back a little in the past (`delayMs`) and blends the two around the playhead, so motion
 * stays smooth despite jitter. Time is passed in, so this is deterministic and testable.
 */
export class SnapshotBuffer {
  private queue: Frame[] = [];
  private prev: Frame | null = null;
  private lastTick = -1;

  constructor(private readonly delayMs = 100) {}

  push(at: number, snap: Snapshot, events: GameEvent[]): void {
    if (snap.tick <= this.lastTick) return; // duplicate or out of order
    this.lastTick = snap.tick;
    this.queue.push({ at, snap, events });
  }

  sample(now: number): Sampled | null {
    const playhead = now - this.delayMs;
    const due: GameEvent[] = [];
    const consume = () => {
      const f = this.queue.shift()!;
      this.prev = f;
      due.push(...f.events);
    };
    while (this.queue.length > 0 && this.queue[0]!.at <= playhead) consume();
    while (this.queue.length > MAX_QUEUE) consume(); // after a lag spike, skip ahead instead of replaying slowly

    const next = this.queue[0];
    if (!this.prev) return next ? { snap: next.snap, events: due } : null;
    if (!next) return { snap: this.prev.snap, events: due }; // starved: hold the last known state
    const span = next.at - this.prev.at;
    const t = span > 0 ? (playhead - this.prev.at) / span : 1;
    return { snap: interpolate(this.prev.snap, next.snap, t), events: due };
  }

  clear(): void {
    this.queue = [];
    this.prev = null;
    this.lastTick = -1;
  }
}
