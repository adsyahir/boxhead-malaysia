import { BALANCE } from "../data/balance";
import { MAX_LEVEL, killsForLevel, rewardAt, weaponStats } from "../data/progression";
import { WEAPONS } from "../data/weapons";
import type { Enemy, GameEvent, Player, WeaponId, World } from "../types";
import { nextFloat, nextInt } from "../rng";
import { spawnPickup } from "./pickups";

export function hurtPlayer(p: Player, dmg: number, ev: GameEvent[]): void {
  if (!p.alive) return;
  p.hp -= dmg;
  ev.push({ type: "playerHurt", id: p.id });
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    ev.push({ type: "playerDowned", id: p.id });
  }
}

export function addScore(w: World, n: number): void {
  w.score += n;
}

/** Ammo a weapon grants right now: its base amount times the Double/Quad Ammo upgrade it has reached. */
export function ammoGrant(w: World, id: WeaponId, base: number = WEAPONS[id].startAmmo): number {
  if (!Number.isFinite(base)) return base;
  return Math.round(base * weaponStats(id, w.level).ammoMult);
}

function unlockWeapon(w: World, id: WeaponId): void {
  if (w.unlocked.includes(id)) return;
  w.unlocked.push(id);
  for (const p of w.players) {
    if (p.alive) p.ammo[id] += ammoGrant(w, id);
  }
}

/** Raise the team level while kills allow it. Each level may unlock a weapon or an upgrade (data/progression.ts). */
export function checkLevelUp(w: World, ev: GameEvent[]): void {
  while (w.level < MAX_LEVEL && w.kills >= killsForLevel(w.level + 1)) {
    w.level += 1;
    const reward = rewardAt(w.level);
    if (reward?.kind === "weapon") unlockWeapon(w, reward.weapon);
    ev.push({ type: "levelUp", level: w.level, reward });
  }
}

export function damageEnemy(w: World, e: Enemy, dmg: number, ev: GameEvent[]): void {
  if (e.hp <= 0 || e.rise > 0) return;
  e.hp -= dmg;
  ev.push({ type: "enemyHit", id: e.id });
  if (e.hp > 0) return;

  w.kills += 1;
  w.combo = w.time - w.lastKillTime <= BALANCE.comboWindow ? Math.min(BALANCE.comboMax, w.combo + 1) : 1;
  w.lastKillTime = w.time;
  const points = e.points * w.combo;
  ev.push({ type: "enemyKilled", id: e.id, kind: e.kind, x: e.x, y: e.y, points, combo: w.combo });
  addScore(w, points);
  checkLevelUp(w, ev);
  dropLoot(w, e);
}

function dropLoot(w: World, e: Enemy): void {
  const roll = nextFloat(w.rng);
  if (roll < BALANCE.dropAmmoChance) {
    if (w.unlocked.some((id) => id !== "lastik")) spawnPickup(w, "ammo", e.x, e.y);
  } else if (roll < BALANCE.dropAmmoChance + BALANCE.dropKetupatChance) {
    spawnPickup(w, "ketupat", e.x, e.y);
  }
}

/** Radial damage with 50% falloff at the edge, knockback, and barrel chaining. Never hurts players. */
export function explode(w: World, x: number, y: number, r: number, dmg: number, ev: GameEvent[]): void {
  ev.push({ type: "explosion", x, y, radius: r });
  for (const e of w.enemies) {
    if (e.hp <= 0 || e.rise > 0) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = Math.hypot(dx, dy);
    if (d > r) continue;
    const push = BALANCE.explosionKnockback * (1 - d / r);
    if (d > 0) {
      e.kx += (dx / d) * push;
      e.ky += (dy / d) * push;
    }
    damageEnemy(w, e, dmg * (1 - (0.5 * d) / r), ev);
  }
  for (const b of w.placeables) {
    if (b.kind !== "barrel" || b.hp <= 0 || b.fuse >= 0) continue;
    if (Math.hypot(b.x - x, b.y - y) <= r) b.fuse = BALANCE.barrelChainDelay;
  }
}

/** An explosion that also schedules Cluster Explode's four smaller blasts when the weapon has that upgrade. */
export function explodeAt(w: World, x: number, y: number, radius: number, damage: number, cluster: boolean, ev: GameEvent[]): void {
  explode(w, x, y, radius, damage, ev);
  if (!cluster) return;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    w.blasts.push({
      x: x + Math.cos(a) * radius * 0.6,
      y: y + Math.sin(a) * radius * 0.6,
      radius: radius * 0.55,
      damage: damage * 0.5,
      delay: 0.12,
    });
  }
}

/** Explode with a weapon's current (upgraded) blast radius, damage and cluster flag. */
export function explodeWeapon(w: World, id: WeaponId, x: number, y: number, ev: GameEvent[]): void {
  const st = weaponStats(id, w.level);
  explodeAt(w, x, y, st.blast, st.damage, st.cluster, ev);
}

/** Fire the secondary blasts whose delay has run out. */
export function updateBlasts(w: World, dt: number, ev: GameEvent[]): void {
  if (w.blasts.length === 0) return;
  const due: typeof w.blasts = [];
  const wait: typeof w.blasts = [];
  for (const b of w.blasts) {
    b.delay -= dt;
    (b.delay <= 0 ? due : wait).push(b);
  }
  w.blasts = wait;
  for (const b of due) explode(w, b.x, b.y, b.radius, b.damage, ev);
}

export function freeSpot(w: World): { x: number; y: number } | null {
  const { cols, rows, tileSize, solid } = w.map;
  for (let i = 0; i < 60; i++) {
    const cx = nextInt(w.rng, cols);
    const cy = nextInt(w.rng, rows);
    if (solid[cy * cols + cx] === 1) continue;
    return { x: (cx + 0.5) * tileSize, y: (cy + 0.5) * tileSize };
  }
  return null;
}
