import { describe, expect, it } from "vitest";
import { createBoxMap, createWorld, step, type PlayerInput } from "@kampung/game-core";
import { NET, applySnapshot, interpolate, parseClientMsg, snapshotWorld } from "../src";

describe("parseClientMsg", () => {
  it("accepts every valid message", () => {
    const ok = [
      { t: "hello", name: "Abu", token: "abc" },
      { t: "hero", hero: "kiah" },
      { t: "ready", ready: true },
      { t: "map", map: "kebun-getah" },
      { t: "start" },
      { t: "input", seq: 1, mx: -1, my: 0.5, fire: true, swap: false, taps: 3 },
      { t: "input", seq: 2, mx: 0, my: 0, fire: false, swap: false, taps: 3, sel: 9 },
      { t: "ping", n: 7 },
      { t: "leave" },
    ];
    for (const m of ok) expect(parseClientMsg(JSON.stringify(m)), JSON.stringify(m)).toEqual(m);
  });

  it.each([
    ["not json", "{nope"],
    ["unknown type", JSON.stringify({ t: "cheat" })],
    ["unknown hero", JSON.stringify({ t: "hero", hero: "boss" })],
    ["unknown map", JSON.stringify({ t: "map", map: "../../etc" })],
    ["input out of range", JSON.stringify({ t: "input", seq: 1, mx: 5, my: 0, fire: false, swap: false, taps: 0 })],
    ["input NaN as null", JSON.stringify({ t: "input", seq: 1, mx: null, my: 0, fire: false, swap: false, taps: 0 })],
    ["weapon pick out of range", JSON.stringify({ t: "input", seq: 1, mx: 0, my: 0, fire: false, swap: false, taps: 0, sel: 10 })],
    ["negative seq", JSON.stringify({ t: "input", seq: -1, mx: 0, my: 0, fire: false, swap: false, taps: 0 })],
    ["name too long", JSON.stringify({ t: "hello", name: "x".repeat(41) })],
    ["binary frame", new ArrayBuffer(4)],
    ["oversized", JSON.stringify({ t: "hello", name: "ok", token: "x".repeat(NET.maxMessageBytes) })],
  ])("rejects %s", (_n, raw) => {
    expect(parseClientMsg(raw)).toBeNull();
  });
});

function playedWorld(ticks: number) {
  const w = createWorld({ seed: 5, map: createBoxMap(60, 40), playerCount: 2 });
  const inputs: PlayerInput[] = [
    { moveX: 1, moveY: 0.4, fire: true, switchWeapon: false },
    { moveX: -1, moveY: -0.3, fire: true, switchWeapon: false },
  ];
  for (let i = 0; i < ticks; i++) step(w, inputs);
  return w;
}

describe("snapshot codec", () => {
  it("round-trips a live world within rounding error", () => {
    const src = playedWorld(900);
    expect(src.enemies.length).toBeGreaterThan(0);
    const snap = JSON.parse(JSON.stringify(snapshotWorld(src))); // through the wire
    const dst = createWorld({ seed: 999, map: createBoxMap(60, 40), playerCount: 2 });
    applySnapshot(dst, snap);

    expect(dst.tick).toBe(src.tick);
    expect(dst.score).toBe(src.score);
    expect(dst.wave).toBe(src.wave);
    expect(dst.phase).toBe(src.phase);
    expect(dst.over).toBe(src.over);
    expect(dst.unlocked).toEqual(src.unlocked);
    expect(dst.level).toBe(src.level);
    expect(dst.enemies).toHaveLength(src.enemies.length);
    expect(dst.projectiles).toHaveLength(src.projectiles.length);
    src.players.forEach((p, i) => {
      expect(dst.players[i]!.x).toBeCloseTo(p.x, 0);
      expect(dst.players[i]!.y).toBeCloseTo(p.y, 0);
      expect(dst.players[i]!.alive).toBe(p.alive);
      expect(dst.players[i]!.weapon).toBe(p.weapon);
    });
    src.enemies.forEach((e, i) => {
      expect(dst.enemies[i]).toMatchObject({ id: e.id, kind: e.kind, radius: e.radius });
      expect(dst.enemies[i]!.x).toBeCloseTo(e.x, 0);
    });
  });

  it("keeps lastik ammo as Infinity across the wire", () => {
    const src = playedWorld(5);
    const snap = JSON.parse(JSON.stringify(snapshotWorld(src)));
    expect(snap.players[0].ammo).toBe(-1);
    const dst = createWorld({ seed: 1, map: createBoxMap(60, 40), playerCount: 2 });
    applySnapshot(dst, snap);
    expect(dst.players[0]!.ammo.lastik).toBe(Infinity);
  });

  it("stays small: a busy world fits in a few KB", () => {
    const src = playedWorld(2400);
    const bytes = JSON.stringify({ t: "snap", s: snapshotWorld(src), e: [] }).length;
    expect(bytes).toBeLessThan(8000);
  });
});

describe("interpolate", () => {
  const w = playedWorld(600);
  const a = snapshotWorld(w);
  for (let i = 0; i < 3; i++) step(w, [{ moveX: 1, moveY: 0, fire: false, switchWeapon: false }, { moveX: 1, moveY: 0, fire: false, switchWeapon: false }]);
  const b = snapshotWorld(w);

  it("is a at t=0 and b at t=1", () => {
    expect(interpolate(a, b, 0).players[0]!.x).toBeCloseTo(a.players[0]!.x, 5);
    expect(interpolate(a, b, 1).players[0]!.x).toBeCloseTo(b.players[0]!.x, 5);
  });

  it("is halfway at t=0.5 and clamps outside 0..1", () => {
    const mid = interpolate(a, b, 0.5).players[0]!;
    expect(mid.x).toBeCloseTo((a.players[0]!.x + b.players[0]!.x) / 2, 5);
    expect(interpolate(a, b, 9).players[0]!.x).toBeCloseTo(b.players[0]!.x, 5);
    expect(interpolate(a, b, -9).players[0]!.x).toBeCloseTo(a.players[0]!.x, 5);
  });

  it("does not smooth teleports (revive, spawn)", () => {
    const far = { ...b, players: b.players.map((p) => ({ ...p, x: p.x + 500 })) };
    expect(interpolate(a, far, 0.5).players[0]!.x).toBeCloseTo(far.players[0]!.x, 5);
  });

  it("new entities appear at their snapshot position", () => {
    const fresh = { ...b, enemies: [[99999, 0, 10, 20, 55, 55, 0, 0]] };
    expect(interpolate(a, fresh, 0.3).enemies[0]).toEqual([99999, 0, 10, 20, 55, 55, 0, 0]);
  });
});

describe("progression over the wire", () => {
  it("carries the level, all ten weapons and the new charge pack", () => {
    const src = createWorld({ seed: 3, map: createBoxMap(60, 40), playerCount: 2 });
    src.level = 77;
    src.unlocked = ["lastik", "railgun", "chargepack"];
    src.players[0]!.weapon = "railgun";
    src.players[0]!.ammo.railgun = 12;
    src.placeables.push({ id: 5, kind: "charge", x: 100, y: 120, radius: 10, hp: 1, arm: 0, fuse: 1.2 });
    const snap = JSON.parse(JSON.stringify(snapshotWorld(src)));
    const dst = createWorld({ seed: 1, map: createBoxMap(60, 40), playerCount: 2 });
    applySnapshot(dst, snap);
    expect(dst.level).toBe(77);
    expect(dst.unlocked).toEqual(["lastik", "railgun", "chargepack"]);
    expect(dst.players[0]).toMatchObject({ weapon: "railgun" });
    expect(dst.players[0]!.ammo.railgun).toBe(12);
    expect(dst.placeables[0]).toMatchObject({ kind: "charge", fuse: 1.2 });
  });
});
