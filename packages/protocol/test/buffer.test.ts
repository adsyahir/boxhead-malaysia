import { describe, expect, it } from "vitest";
import type { GameEvent } from "@kampung/game-core";
import { SnapshotBuffer, type Snapshot } from "../src";

function snap(tick: number, x: number): Snapshot {
  return {
    tick, time: tick / 60, score: 0, kills: 0, combo: 1, wave: 1, phase: 1, breakTimer: 0, unlocked: [0], level: 1, queue: 0, over: false,
    players: [{ x, y: 100, hp: 100, alive: true, away: false, fx: 1, fy: 0, w: 0, ammo: -1 }],
    enemies: [], projectiles: [], placeables: [], pickups: [],
  };
}
const ev = (n: number): GameEvent => ({ type: "waveStarted", wave: n });

describe("SnapshotBuffer", () => {
  it("returns nothing until a snapshot arrives", () => {
    expect(new SnapshotBuffer().sample(0)).toBeNull();
  });

  it("blends between snapshots, a delay behind the newest", () => {
    const b = new SnapshotBuffer(100);
    b.push(1000, snap(3, 0), []);
    b.push(1050, snap(6, 10), []);
    b.push(1100, snap(9, 20), []);
    // playhead = 1075 - 100 = 975 is before everything: hold the first
    expect(b.sample(1075)!.snap.players[0]!.x).toBe(0);
    // playhead 1025 -> halfway between the first two
    expect(b.sample(1125)!.snap.players[0]!.x).toBeCloseTo(5, 5);
    // playhead 1075 -> halfway between the second and third (first was consumed)
    expect(b.sample(1175)!.snap.players[0]!.x).toBeCloseTo(15, 5);
  });

  it("delivers each event once, in order, when the playhead passes its snapshot", () => {
    const b = new SnapshotBuffer(100);
    b.push(1000, snap(3, 0), [ev(1)]);
    b.push(1050, snap(6, 10), [ev(2)]);
    b.push(1100, snap(9, 20), [ev(3)]);
    expect(b.sample(1050)!.events).toEqual([]); // playhead 950: nothing passed
    expect(b.sample(1110)!.events).toEqual([ev(1)]); // playhead 1010
    expect(b.sample(1120)!.events).toEqual([]); // no repeats
    expect(b.sample(1200)!.events).toEqual([ev(2), ev(3)]); // playhead 1100 passes the rest
    expect(b.sample(1300)!.events).toEqual([]);
  });

  it("holds the last state when starved instead of jumping", () => {
    const b = new SnapshotBuffer(100);
    b.push(1000, snap(3, 40), []);
    b.push(1050, snap(6, 80), []);
    const out = b.sample(5000)!;
    expect(out.snap.players[0]!.x).toBe(80);
  });

  it("ignores duplicate and out-of-order snapshots", () => {
    const b = new SnapshotBuffer(100);
    b.push(1000, snap(6, 60), []);
    b.push(1010, snap(3, 30), [ev(9)]); // older tick arrives late
    b.push(1020, snap(6, 61), [ev(9)]); // duplicate tick
    b.push(1050, snap(9, 90), []);
    expect(b.sample(2000)!.events).toEqual([]);
    expect(b.sample(2000)!.snap.players[0]!.x).toBe(90);
  });

  it("skips ahead after a lag spike but still delivers the events it skipped", () => {
    const b = new SnapshotBuffer(100);
    for (let i = 1; i <= 30; i++) b.push(10_000 + i, snap(i * 3, i), [ev(i)]);
    const out = b.sample(10_000 + 1)!; // playhead far behind: the queue is too long, so it fast-forwards
    expect(out.events.length).toBeGreaterThan(10);
    expect(out.events[0]).toEqual(ev(1));
    expect(out.events.map((e) => (e as { wave: number }).wave)).toEqual([...out.events.map((e) => (e as { wave: number }).wave)].sort((a, b) => a - b));
  });

  it("clear resets everything, including the duplicate guard", () => {
    const b = new SnapshotBuffer(100);
    b.push(1000, snap(30, 1), []);
    b.clear();
    expect(b.sample(2000)).toBeNull();
    b.push(2000, snap(3, 2), []);
    expect(b.sample(3000)!.snap.players[0]!.x).toBe(2);
  });
});
