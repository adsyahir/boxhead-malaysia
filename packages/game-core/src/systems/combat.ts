import { BALANCE } from "../data/balance";
import { WEAPONS } from "../data/weapons";
import { WEAPON_IDS, type Enemy, type GameEvent, type Player, type World } from "../types";
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

export function addScore(w: World, n: number, ev: GameEvent[]): void {
  w.score += n;
  checkUnlocks(w, ev);
}

export function checkUnlocks(w: World, ev: GameEvent[]): void {
  for (const id of WEAPON_IDS) {
    if (w.unlocked.includes(id) || w.score < WEAPONS[id].unlockScore) continue;
    w.unlocked.push(id);
    for (const p of w.players) {
      if (p.alive) p.ammo[id] += WEAPONS[id].startAmmo;
    }
    ev.push({ type: "weaponUnlocked", weapon: id });
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
  addScore(w, points, ev);
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
