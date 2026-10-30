import { BALANCE } from "./data/balance";
import type { MapData } from "./map/map-data";
import { createRng } from "./rng";
import { updateEnemies } from "./systems/enemies";
import { updateFlow, buildFlow } from "./systems/flowfield";
import { updatePickups } from "./systems/pickups";
import { updatePlaceables } from "./systems/placeables";
import { updatePlayers } from "./systems/players";
import { updateProjectiles } from "./systems/projectiles";
import { updateWaves } from "./systems/waves";
import { WEAPON_IDS, type GameEvent, type Player, type PlayerInput, type World } from "./types";

export interface WorldOptions {
  seed: number;
  map: MapData;
  playerCount: 1 | 2;
}

function createPlayer(id: number, map: MapData): Player {
  const start = map.playerStarts[id % map.playerStarts.length]!;
  const ammo = {} as Player["ammo"];
  for (const wid of WEAPON_IDS) ammo[wid] = 0;
  ammo.lastik = Infinity;
  return {
    id,
    x: start.x,
    y: start.y,
    radius: BALANCE.playerRadius,
    hp: BALANCE.playerMaxHp,
    maxHp: BALANCE.playerMaxHp,
    alive: true,
    facing: { x: 1, y: 0 },
    weapon: "lastik",
    ammo,
    cooldown: 0,
    prevSwitch: false,
  };
}

export function createWorld(opts: WorldOptions): World {
  const w: World = {
    map: opts.map,
    rng: createRng(opts.seed),
    time: 0,
    tick: 0,
    nextId: 1,
    players: Array.from({ length: opts.playerCount }, (_, i) => createPlayer(i, opts.map)),
    enemies: [],
    projectiles: [],
    placeables: [],
    pickups: [],
    unlocked: ["lastik"],
    score: 0,
    kills: 0,
    combo: 1,
    lastKillTime: -1000,
    wave: 0,
    phase: "break",
    breakTimer: BALANCE.firstWaveDelay,
    queue: [],
    spawnTimer: 0,
    spawnedTotal: 0,
    flow: { dist: new Int32Array(opts.map.cols * opts.map.rows).fill(-1), timer: 0, dirty: true },
    over: false,
  };
  buildFlow(w);
  return w;
}

/** Advance the simulation one tick. Mutates `world` in place and returns what happened. */
export function step(world: World, inputs: PlayerInput[], dt: number = BALANCE.dt): GameEvent[] {
  const ev: GameEvent[] = [];
  if (world.over) return ev;

  world.time += dt;
  world.tick += 1;
  if (world.time - world.lastKillTime > BALANCE.comboWindow) world.combo = 1;

  updateFlow(world, dt);
  updatePlayers(world, inputs, dt, ev);
  updateWaves(world, dt, ev);
  updateEnemies(world, dt, ev);
  updateProjectiles(world, dt, ev);
  updatePlaceables(world, dt, ev);
  updatePickups(world, dt, ev);
  world.enemies = world.enemies.filter((e) => e.hp > 0);

  if (world.players.every((p) => !p.alive)) {
    world.over = true;
    ev.push({
      type: "gameOver",
      score: world.score,
      wave: world.wave,
      kills: world.kills,
      durationMs: Math.round(world.time * 1000),
    });
  }
  return ev;
}
