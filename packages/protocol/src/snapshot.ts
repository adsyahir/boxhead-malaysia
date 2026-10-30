import { ENEMIES, WEAPON_IDS, type EnemyKind, type PickupKind, type PlaceableKind, type ProjectileKind, type WeaponId, type World } from "@kampung/game-core";

/**
 * Compact network form of a World. Entities are number arrays (id first), positions rounded to 0.1 px.
 * The map and rng never travel: both sides load the same map by id.
 */
export interface SnapPlayer {
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  away: boolean;
  fx: number;
  fy: number;
  /** index into WEAPON_IDS */
  w: number;
  /** -1 = unlimited */
  ammo: number;
}

export interface Snapshot {
  tick: number;
  time: number;
  score: number;
  kills: number;
  combo: number;
  wave: number;
  /** 0 = break, 1 = wave */
  phase: 0 | 1;
  breakTimer: number;
  unlocked: number[];
  queue: number;
  over: boolean;
  players: SnapPlayer[];
  /** [id, kind, x, y, hp, maxHp, rise, hop] */
  enemies: number[][];
  /** [id, kind, x, y, vx, vy, radius, life] */
  projectiles: number[][];
  /** [id, kind, x, y, radius, hp, arm, fuse] */
  placeables: number[][];
  /** [id, kind, x, y, age, ttl] */
  pickups: number[][];
}

const ENEMY_KINDS: EnemyKind[] = ["pocong", "toyol", "pontianak"];
const PROJECTILE_KINDS: ProjectileKind[] = ["bullet", "pellet", "rocket", "fireball", "grenade"];
const PLACEABLE_KINDS: PlaceableKind[] = ["barricade", "barrel", "mine"];
const PICKUP_KINDS: PickupKind[] = ["ammo", "ketupat", "crate"];

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function snapshotWorld(w: World): Snapshot {
  return {
    tick: w.tick,
    time: r3(w.time),
    score: w.score,
    kills: w.kills,
    combo: w.combo,
    wave: w.wave,
    phase: w.phase === "wave" ? 1 : 0,
    breakTimer: r3(w.breakTimer),
    unlocked: w.unlocked.map((id) => WEAPON_IDS.indexOf(id)),
    queue: w.queue.length,
    over: w.over,
    players: w.players.map((p) => ({
      x: r1(p.x),
      y: r1(p.y),
      hp: Math.round(p.hp),
      alive: p.alive,
      away: p.away,
      fx: r3(p.facing.x),
      fy: r3(p.facing.y),
      w: WEAPON_IDS.indexOf(p.weapon),
      ammo: Number.isFinite(p.ammo[p.weapon]) ? p.ammo[p.weapon] : -1,
    })),
    enemies: w.enemies.map((e) => [e.id, ENEMY_KINDS.indexOf(e.kind), r1(e.x), r1(e.y), Math.round(e.hp), Math.round(e.maxHp), r3(Math.max(0, e.rise)), r3(e.hop)]),
    projectiles: w.projectiles.map((p) => [p.id, PROJECTILE_KINDS.indexOf(p.kind), r1(p.x), r1(p.y), Math.round(p.vx), Math.round(p.vy), p.radius, r3(p.life)]),
    placeables: w.placeables.map((b) => [b.id, PLACEABLE_KINDS.indexOf(b.kind), r1(b.x), r1(b.y), b.radius, Math.round(b.hp), r3(b.arm), r3(b.fuse)]),
    pickups: w.pickups.map((p) => [p.id, PICKUP_KINDS.indexOf(p.kind), r1(p.x), r1(p.y), r3(p.age), p.ttl]),
  };
}

/**
 * Overwrite a client-side World with a snapshot. The World must come from createWorld() with the same map,
 * so renderers can keep reading it exactly like a locally simulated one.
 */
export function applySnapshot(w: World, s: Snapshot): void {
  w.tick = s.tick;
  w.time = s.time;
  w.score = s.score;
  w.kills = s.kills;
  w.combo = s.combo;
  w.wave = s.wave;
  w.phase = s.phase === 1 ? "wave" : "break";
  w.breakTimer = s.breakTimer;
  w.unlocked = s.unlocked.map((i) => WEAPON_IDS[i]).filter((x): x is WeaponId => x !== undefined);
  w.over = s.over;
  // The HUD counts queued enemies; the client has no queue, so mirror its length.
  w.queue = new Array<EnemyKind>(s.queue).fill("pocong");

  s.players.forEach((sp, i) => {
    const p = w.players[i];
    if (!p) return;
    p.x = sp.x;
    p.y = sp.y;
    p.hp = sp.hp;
    p.alive = sp.alive;
    p.away = sp.away;
    p.facing = { x: sp.fx, y: sp.fy };
    const weapon = WEAPON_IDS[sp.w] ?? "lastik";
    p.weapon = weapon;
    p.ammo[weapon] = sp.ammo < 0 ? Infinity : sp.ammo;
  });

  w.enemies = s.enemies.map((a) => {
    const kind = ENEMY_KINDS[a[1]!] ?? "pocong";
    const def = ENEMIES[kind];
    return {
      id: a[0]!, kind, x: a[2]!, y: a[3]!, radius: def.radius, hp: a[4]!, maxHp: a[5]!, speed: def.speed,
      contactDamage: def.contactDamage, points: def.points, rise: a[6]!, attackCd: 0, fireCd: 0, hop: a[7]!, kx: 0, ky: 0,
    };
  });
  w.projectiles = s.projectiles.map((a) => ({
    id: a[0]!, kind: PROJECTILE_KINDS[a[1]!] ?? "bullet", x: a[2]!, y: a[3]!, vx: a[4]!, vy: a[5]!, damage: 0, radius: a[6]!, life: a[7]!, blast: 0,
  }));
  w.placeables = s.placeables.map((a) => ({
    id: a[0]!, kind: PLACEABLE_KINDS[a[1]!] ?? "barricade", x: a[2]!, y: a[3]!, radius: a[4]!, hp: a[5]!, arm: a[6]!, fuse: a[7]!,
  }));
  w.pickups = s.pickups.map((a) => ({ id: a[0]!, kind: PICKUP_KINDS[a[1]!] ?? "ammo", x: a[2]!, y: a[3]!, age: a[4]!, ttl: a[5]! }));
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Moves longer than this between two snapshots are teleports (spawn, revive), not motion to smooth. */
const TELEPORT_PX = 90;

function lerpEntities(a: number[][], b: number[][], t: number, xi: number, yi: number): number[][] {
  const prev = new Map<number, number[]>();
  for (const e of a) prev.set(e[0]!, e);
  return b.map((e) => {
    const p = prev.get(e[0]!);
    if (!p) return e;
    const dx = e[xi]! - p[xi]!;
    const dy = e[yi]! - p[yi]!;
    if (Math.hypot(dx, dy) > TELEPORT_PX) return e;
    const out = e.slice();
    out[xi] = lerp(p[xi]!, e[xi]!, t);
    out[yi] = lerp(p[yi]!, e[yi]!, t);
    return out;
  });
}

/** State between snapshots `a` and `b` (t = 0 gives a, t = 1 gives b). Entities are matched by id. */
export function interpolate(a: Snapshot, b: Snapshot, t: number): Snapshot {
  const k = Math.min(1, Math.max(0, t));
  return {
    ...b,
    time: lerp(a.time, b.time, k),
    players: b.players.map((bp, i) => {
      const ap = a.players[i];
      if (!ap || Math.hypot(bp.x - ap.x, bp.y - ap.y) > TELEPORT_PX) return bp;
      return { ...bp, x: lerp(ap.x, bp.x, k), y: lerp(ap.y, bp.y, k) };
    }),
    enemies: lerpEntities(a.enemies, b.enemies, k, 2, 3),
    projectiles: lerpEntities(a.projectiles, b.projectiles, k, 2, 3),
  };
}
