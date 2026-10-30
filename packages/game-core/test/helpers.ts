import { createBoxMap, createWorld, step, type GameEvent, type PlayerInput, type World, type Enemy, BALANCE } from "../src";

export const IDLE: PlayerInput = { moveX: 0, moveY: 0, fire: false, switchWeapon: false };

export function makeWorld(opts: { seed?: number; players?: 1 | 2; cols?: number; rows?: number } = {}): World {
  return createWorld({
    seed: opts.seed ?? 1,
    map: createBoxMap(opts.cols ?? 40, opts.rows ?? 30),
    playerCount: opts.players ?? 1,
  });
}

/** Run n ticks with the same inputs each tick; returns all events. */
export function run(w: World, n: number, inputs: PlayerInput[] = [IDLE]): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...step(w, inputs));
  return all;
}

export function seconds(s: number): number {
  return Math.round(s * BALANCE.tickRate);
}

export function addEnemy(w: World, x: number, y: number, kind: Enemy["kind"] = "pocong", over: Partial<Enemy> = {}): Enemy {
  const e: Enemy = {
    id: w.nextId++,
    kind,
    x,
    y,
    radius: kind === "toyol" ? 8 : kind === "pontianak" ? 12 : 11,
    hp: 55,
    maxHp: 55,
    speed: 0,
    contactDamage: 9,
    points: 100,
    rise: 0,
    attackCd: 0,
    fireCd: 99,
    hop: 0,
    kx: 0,
    ky: 0,
    ...over,
  };
  w.enemies.push(e);
  return e;
}

/** Put the world mid-wave with nothing queued so tests control the enemies. */
export function quietWave(w: World): void {
  w.phase = "wave";
  w.wave = 1;
  w.queue = [];
  // keep wave from ending by default: a sentinel far-away enemy
  addEnemy(w, 40, 40, "pocong", { hp: 1e9, maxHp: 1e9 });
}
