import { pointSolid } from "../map/collision";
import type { GameEvent, Projectile, World } from "../types";
import { damageEnemy, explode, hurtPlayer } from "./combat";

export function updateProjectiles(w: World, dt: number, ev: GameEvent[]): void {
  for (const pr of w.projectiles) {
    if (pr.life <= 0) continue;
    pr.life -= dt;

    if (pr.kind === "grenade") {
      const drag = Math.pow(0.02, dt);
      pr.vx *= drag;
      pr.vy *= drag;
      const nx = pr.x + pr.vx * dt;
      const ny = pr.y + pr.vy * dt;
      if (pointSolid(w.map, nx, ny)) {
        pr.vx = 0;
        pr.vy = 0;
      } else {
        pr.x = nx;
        pr.y = ny;
      }
      if (pr.life <= 0) explode(w, pr.x, pr.y, pr.blast, pr.damage, ev);
      continue;
    }

    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;

    if (pointSolid(w.map, pr.x, pr.y)) {
      detonate(w, pr, ev);
      continue;
    }

    if (pr.kind === "fireball") {
      const hit = w.players.find((p) => p.alive && Math.hypot(p.x - pr.x, p.y - pr.y) < p.radius + pr.radius);
      if (hit) {
        hurtPlayer(hit, pr.damage, ev);
        pr.life = 0;
      }
      continue;
    }

    const enemy = w.enemies.find((e) => e.hp > 0 && e.rise <= 0 && Math.hypot(e.x - pr.x, e.y - pr.y) < e.radius + pr.radius);
    const barrel = w.placeables.find(
      (b) => b.kind === "barrel" && b.hp > 0 && Math.hypot(b.x - pr.x, b.y - pr.y) < b.radius + pr.radius,
    );
    if (enemy || barrel) {
      if (barrel && !enemy) barrel.fuse = 0;
      if (enemy && pr.kind !== "rocket") damageEnemy(w, enemy, pr.damage, ev);
      if (barrel && enemy) barrel.fuse = 0;
      detonate(w, pr, ev);
      continue;
    }

    if (pr.life <= 0 && pr.kind === "rocket") explode(w, pr.x, pr.y, pr.blast, pr.damage, ev);
  }
  w.projectiles = w.projectiles.filter((p) => p.life > 0);
}

/** Rockets explode on impact; everything else just ends. */
function detonate(w: World, pr: Projectile, ev: GameEvent[]): void {
  if (pr.kind === "rocket") explode(w, pr.x, pr.y, pr.blast, pr.damage, ev);
  pr.life = 0;
}
