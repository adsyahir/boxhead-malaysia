import { BALANCE } from "../data/balance";
import { PONTIANAK, POCONG_HOP } from "../data/enemies";
import { moveCircle } from "../map/collision";
import { rangeFloat } from "../rng";
import type { Enemy, GameEvent, Player, World } from "../types";
import { hurtPlayer } from "./combat";
import { flowDirection } from "./flowfield";

function nearestPlayer(w: World, e: Enemy): { p: Player; d: number } | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of w.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best ? { p: best, d: bd } : null;
}

function speedFactor(e: Enemy, nearDist: number): number {
  if (e.kind === "pocong") return Math.max(POCONG_HOP.minFactor, 1 + POCONG_HOP.amplitude * Math.sin(e.hop));
  if (e.kind === "pontianak" && nearDist < PONTIANAK.slowRadius) return PONTIANAK.slowFactor;
  return 1;
}

export function updateEnemies(w: World, dt: number, ev: GameEvent[]): void {
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    if (e.rise > 0) {
      e.rise -= dt;
      continue;
    }
    e.attackCd = Math.max(0, e.attackCd - dt);
    e.hop += POCONG_HOP.rate * dt;

    const target = nearestPlayer(w, e);
    let vx = 0;
    let vy = 0;
    if (target) {
      let dir = { x: (target.p.x - e.x) / (target.d || 1), y: (target.p.y - e.y) / (target.d || 1) };
      if (target.d > BALANCE.chaseDirectDistance) dir = flowDirection(w, e.x, e.y) ?? dir;
      const s = e.speed * speedFactor(e, target.d);
      vx = dir.x * s;
      vy = dir.y * s;

      if (e.kind === "pontianak") {
        e.fireCd -= dt;
        if (e.fireCd <= 0 && target.d <= PONTIANAK.fireRange) {
          const ux = (target.p.x - e.x) / (target.d || 1);
          const uy = (target.p.y - e.y) / (target.d || 1);
          w.projectiles.push({
            id: w.nextId++,
            kind: "fireball",
            x: e.x,
            y: e.y,
            vx: ux * PONTIANAK.fireballSpeed,
            vy: uy * PONTIANAK.fireballSpeed,
            damage: PONTIANAK.fireballDamage,
            radius: PONTIANAK.fireballRadius,
            life: PONTIANAK.fireballLife,
            blast: 0,
          });
          ev.push({ type: "fireball", x: e.x, y: e.y });
          e.fireCd = rangeFloat(w.rng, PONTIANAK.fireMinCd, PONTIANAK.fireMaxCd);
        }
      }
    }

    const next = moveCircle(w.map, e.x, e.y, e.radius, (vx + e.kx) * dt, (vy + e.ky) * dt);
    e.x = next.x;
    e.y = next.y;
    const decay = Math.max(0, 1 - BALANCE.knockbackDecay * dt);
    e.kx *= decay;
    e.ky *= decay;

    // Barricades block enemies; a blocked enemy chews on the barricade.
    for (const b of w.placeables) {
      if (b.kind !== "barricade" || b.hp <= 0) continue;
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const min = e.radius + b.radius;
      if (d >= min + 2) continue;
      if (d < min) {
        const pushed = moveCircle(w.map, e.x, e.y, e.radius, (dx / d) * (min - d), (dy / d) * (min - d));
        e.x = pushed.x;
        e.y = pushed.y;
      }
      if (e.attackCd <= 0) {
        b.hp -= e.contactDamage;
        e.attackCd = BALANCE.contactCooldown;
        if (b.hp <= 0) w.flow.dirty = true;
      }
    }
  }

  separate(w);

  for (const e of w.enemies) {
    if (e.hp <= 0 || e.rise > 0 || e.attackCd > 0) continue;
    const victim = w.players.find((p) => p.alive && Math.hypot(p.x - e.x, p.y - e.y) < e.radius + p.radius);
    if (!victim) continue;
    hurtPlayer(victim, e.contactDamage, ev);
    e.attackCd = BALANCE.contactCooldown;
  }
}

function separate(w: World): void {
  const es = w.enemies.filter((e) => e.hp > 0 && e.rise <= 0);
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      const a = es[i]!;
      const b = es[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      // Exactly overlapping enemies get a deterministic nudge apart.
      const nx = d > 0.001 ? dx / d : 1;
      const ny = d > 0.001 ? dy / d : 0;
      const push = (min - d) / 2;
      const pa = moveCircle(w.map, a.x, a.y, a.radius, -nx * push, -ny * push);
      const pb = moveCircle(w.map, b.x, b.y, b.radius, nx * push, ny * push);
      a.x = pa.x;
      a.y = pa.y;
      b.x = pb.x;
      b.y = pb.y;
    }
  }
}
