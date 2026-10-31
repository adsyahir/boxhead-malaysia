import { describe, expect, it } from "vitest";
import { BALANCE, createBoxMap, movePlayer, snap8, step, type Walker } from "../src";
import { IDLE, makeWorld, quietWave } from "./helpers";

const walker = (x: number, y: number): Walker => ({ x, y, radius: BALANCE.playerRadius, facing: { x: 1, y: 0 } });

describe("movePlayer (shared by the simulation and a predicting client)", () => {
  const map = createBoxMap(40, 30);

  it("moves at player speed and clamps a stick longer than 1", () => {
    const p = walker(300, 300);
    for (let i = 0; i < 60; i++) movePlayer(map, p, 1, 0, BALANCE.dt);
    expect(p.x - 300).toBeCloseTo(BALANCE.playerSpeed, 3);
    const q = walker(300, 300);
    for (let i = 0; i < 60; i++) movePlayer(map, q, 5, 5, BALANCE.dt); // same speed as a full stick
    expect(Math.hypot(q.x - 300, q.y - 300)).toBeCloseTo(BALANCE.playerSpeed, 3);
  });

  it("ignores a tiny stick and keeps the facing", () => {
    const p = walker(300, 300);
    p.facing = { x: 0, y: 1 };
    movePlayer(map, p, 0.005, 0, BALANCE.dt);
    expect(p).toMatchObject({ x: 300, y: 300, facing: { x: 0, y: 1 } });
  });

  it("snaps facing to 8 directions", () => {
    expect(snap8(1, 0.1)).toEqual({ x: 1, y: 0 });
    const d = snap8(1, 1);
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.y).toBeCloseTo(Math.SQRT1_2);
  });

  it("slides along a wall and stops at the border", () => {
    const p = walker(map.tileSize + p0r(), 300);
    for (let i = 0; i < 120; i++) movePlayer(map, p, -1, 0.5, BALANCE.dt);
    expect(p.x).toBeGreaterThanOrEqual(map.tileSize + BALANCE.playerRadius - 0.01);
    expect(p.y).toBeGreaterThan(300); // kept sliding down the wall
  });

  it("gives exactly the same result as the world simulation, tick for tick", () => {
    const w = makeWorld();
    quietWave(w);
    const ghost = walker(w.players[0]!.x, w.players[0]!.y);
    const moves = [[1, 0], [1, 1], [0, 1], [-1, 0.3], [0, 0], [-1, -1], [0.4, -1]];
    for (let i = 0; i < 700; i++) {
      const [mx, my] = moves[Math.floor(i / 100)]!;
      step(w, [{ ...IDLE, moveX: mx!, moveY: my! }]);
      movePlayer(w.map, ghost, mx!, my!, BALANCE.dt);
      expect(ghost.x).toBeCloseTo(w.players[0]!.x, 9);
      expect(ghost.y).toBeCloseTo(w.players[0]!.y, 9);
    }
    expect(ghost.facing.x).toBeCloseTo(w.players[0]!.facing.x, 9);
  });
});

function p0r(): number {
  return BALANCE.playerRadius + 0.5;
}
