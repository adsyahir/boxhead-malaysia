import { describe, expect, it } from "vitest";
import { ENEMIES, PONTIANAK, createBoxMap, createWorld } from "../src";
import { buildFlow, flowDirection } from "../src/systems/flowfield";
import { IDLE, addEnemy, makeWorld, quietWave, run, seconds } from "./helpers";

describe("flow field", () => {
  it("routes around a wall", () => {
    const map = createBoxMap(20, 12);
    // vertical wall at column 10 with a gap at rows 9-10
    for (let y = 1; y < 9; y++) map.solid[y * 20 + 10] = 1;
    const w = createWorld({ seed: 1, map, playerCount: 1 });
    w.players[0]!.x = 15 * 32 + 16;
    w.players[0]!.y = 3 * 32 + 16;
    buildFlow(w);
    // enemy on the other side of the wall at the same row must head down toward the gap, not straight
    const dir = flowDirection(w, 5 * 32 + 16, 3 * 32 + 16)!;
    expect(dir).not.toBeNull();
    expect(dir.y).toBeGreaterThan(0);
  });

  it("marks unreachable cells and returns null", () => {
    const map = createBoxMap(20, 12);
    for (let y = 1; y < 11; y++) map.solid[y * 20 + 10] = 1;
    const w = createWorld({ seed: 1, map, playerCount: 1 });
    w.players[0]!.x = 15 * 32 + 16;
    w.players[0]!.y = 5 * 32 + 16;
    buildFlow(w);
    expect(flowDirection(w, 5 * 32 + 16, 5 * 32 + 16)).toBeNull();
  });

  it("no corner cutting on diagonals", () => {
    const map = createBoxMap(10, 10);
    map.solid[4 * 10 + 5] = 1; // block (5,4)
    const w = createWorld({ seed: 1, map, playerCount: 1 });
    w.players[0]!.x = 5 * 32 + 16;
    w.players[0]!.y = 5 * 32 + 16;
    buildFlow(w);
    // cell (4,4) is diagonal to (5,5) but (5,4) is blocked: dist must be 2, not 1
    expect(w.flow.dist[4 * 10 + 4]).toBe(2);
  });

  it("rebuilds when a barricade is destroyed", () => {
    const w = makeWorld();
    quietWave(w);
    w.placeables.push({ id: 77, kind: "barricade", x: 300, y: 300, radius: 14, hp: 0.5, arm: 0, fuse: -1 });
    addEnemy(w, 300 + 20, 300, "pocong", { contactDamage: 5 });
    run(w, 3);
    expect(w.placeables.filter((p) => p.kind === "barricade")).toHaveLength(0);
    expect(w.flow.dirty).toBe(false); // rebuilt on the next update
  });
});

describe("enemies", () => {
  it("chase the player and deal contact damage on a 0.8s cooldown", () => {
    const w = makeWorld();
    quietWave(w);
    const p = w.players[0]!;
    addEnemy(w, p.x + 20, p.y, "pocong", { speed: 62 });
    run(w, seconds(1.7));
    // hits at t~0, 0.8, 1.6
    expect(p.hp).toBe(100 - 9 * 3);
  });

  it("enemy pocong closes distance along open ground", () => {
    const w = makeWorld();
    quietWave(w);
    const p = w.players[0]!;
    const e = addEnemy(w, p.x + 300, p.y, "pocong", { speed: 62 });
    const d0 = Math.hypot(e.x - p.x, e.y - p.y);
    run(w, seconds(3));
    expect(Math.hypot(e.x - p.x, e.y - p.y)).toBeLessThan(d0 - 40);
  });

  it("rising enemies neither move nor attack", () => {
    const w = makeWorld();
    quietWave(w);
    const p = w.players[0]!;
    const e = addEnemy(w, p.x + 15, p.y, "pocong", { speed: 62, rise: 0.7 });
    run(w, seconds(0.5));
    expect(p.hp).toBe(100);
    expect(e.x).toBe(p.x + 15);
  });

  it("pontianak throws fireballs within 400px for 12 damage", () => {
    const w = makeWorld({ cols: 60, rows: 30 });
    quietWave(w);
    const p = w.players[0]!;
    const e = addEnemy(w, p.x + 300, p.y, "pontianak", { speed: 0, fireCd: 0.1, hp: 170, maxHp: 170, contactDamage: 14 });
    const ev = run(w, seconds(2));
    expect(ev.some((x) => x.type === "fireball")).toBe(true);
    expect(p.hp).toBe(100 - PONTIANAK.fireballDamage);
    expect(e.fireCd).toBeGreaterThan(0);
  });

  it("pontianak outside 400px does not fire", () => {
    const w = makeWorld({ cols: 60, rows: 30 });
    quietWave(w);
    const p = w.players[0]!;
    addEnemy(w, p.x + 500, p.y, "pontianak", { speed: 0, fireCd: 0 });
    const ev = run(w, seconds(1));
    expect(ev.some((x) => x.type === "fireball")).toBe(false);
  });

  it("enemies push apart instead of stacking", () => {
    const w = makeWorld();
    quietWave(w);
    const a = addEnemy(w, 300, 300, "pocong");
    const b = addEnemy(w, 302, 300, "pocong");
    run(w, 10, [IDLE]);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(ENEMIES.pocong.radius * 2 - 0.5);
  });
});
