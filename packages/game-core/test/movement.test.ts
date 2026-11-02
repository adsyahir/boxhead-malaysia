import { describe, expect, it } from "vitest";
import { AIM_DEAD_ZONE, BALANCE, createBoxMap, movePlayer, snap8, step, type Walker } from "../src";
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

describe("twin-stick aim", () => {
  const map = createBoxMap(40, 30);

  it("faces the exact aim direction (not snapped) while walking another way", () => {
    const p = walker(300, 300);
    for (let i = 0; i < 30; i++) movePlayer(map, p, 1, 0, BALANCE.dt, 0.3, -0.9);
    expect(p.x).toBeGreaterThan(300); // still walks right
    expect(p.y).toBeCloseTo(300, 9);
    const len = Math.hypot(0.3, -0.9);
    expect(p.facing.x).toBeCloseTo(0.3 / len, 9);
    expect(p.facing.y).toBeCloseTo(-0.9 / len, 9);
  });

  it("aims while standing still", () => {
    const p = walker(300, 300);
    movePlayer(map, p, 0, 0, BALANCE.dt, -1, 0);
    expect(p).toMatchObject({ x: 300, y: 300, facing: { x: -1, y: 0 } });
  });

  it("ignores an aim inside the dead zone, so facing follows movement", () => {
    const p = walker(300, 300);
    movePlayer(map, p, 0, 1, BALANCE.dt, AIM_DEAD_ZONE * 0.9, 0);
    expect(p.facing).toEqual(snap8(0, 1));
  });

  it("the world shoots where the player aims and stays identical to movePlayer", () => {
    const w = makeWorld();
    quietWave(w);
    const ghost = walker(w.players[0]!.x, w.players[0]!.y);
    for (let i = 0; i < 120; i++) {
      step(w, [{ ...IDLE, moveX: 1, moveY: 0, aimX: 0, aimY: -1, fire: true }]);
      movePlayer(w.map, ghost, 1, 0, BALANCE.dt, 0, -1);
      expect(ghost.x).toBeCloseTo(w.players[0]!.x, 9);
    }
    expect(w.players[0]!.facing).toEqual({ x: 0, y: -1 });
    const shots = w.projectiles;
    expect(shots.length).toBeGreaterThan(0);
    for (const b of shots) expect(b.vy).toBeLessThan(0);
  });
});

function p0r(): number {
  return BALANCE.playerRadius + 0.5;
}
