import { BALANCE } from "../data/balance";
import { PLACEABLE, WEAPONS } from "../data/weapons";
import { circleHitsWall, moveCircle } from "../map/collision";
import { rangeFloat } from "../rng";
import { WEAPON_IDS, type GameEvent, type Player, type PlayerInput, type Vec, type World } from "../types";

const IDLE: PlayerInput = { moveX: 0, moveY: 0, fire: false, switchWeapon: false };

function snap8(x: number, y: number): Vec {
  const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: Math.cos(a), y: Math.sin(a) };
}

function hasAmmo(p: Player, w: World, id: (typeof WEAPON_IDS)[number]): boolean {
  return w.unlocked.includes(id) && p.ammo[id] > 0;
}

/** Next usable weapon after the current one, wrapping. Lastik is always usable. */
export function nextUsableWeapon(w: World, p: Player): Player["weapon"] {
  const start = WEAPON_IDS.indexOf(p.weapon);
  for (let i = 1; i <= WEAPON_IDS.length; i++) {
    const id = WEAPON_IDS[(start + i) % WEAPON_IDS.length]!;
    if (hasAmmo(p, w, id)) return id;
  }
  return "lastik";
}

export function updatePlayers(w: World, inputs: PlayerInput[], dt: number, ev: GameEvent[]): void {
  w.players.forEach((p, i) => {
    if (!p.alive) return;
    const input = inputs[i] ?? IDLE;

    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (len > 0.01) {
      p.facing = snap8(mx, my);
      const next = moveCircle(w.map, p.x, p.y, p.radius, mx * BALANCE.playerSpeed * dt, my * BALANCE.playerSpeed * dt);
      p.x = next.x;
      p.y = next.y;
    }

    if (input.switchWeapon && !p.prevSwitch) p.weapon = nextUsableWeapon(w, p);
    p.prevSwitch = input.switchWeapon;

    p.cooldown = Math.max(0, p.cooldown - dt);
    if (input.fire && p.cooldown <= 1e-9) fire(w, p, ev);
  });
}

function fire(w: World, p: Player, ev: GameEvent[]): void {
  const def = WEAPONS[p.weapon];
  if (p.ammo[def.id] <= 0) {
    p.weapon = nextUsableWeapon(w, p);
    return;
  }
  const baseAngle = Math.atan2(p.facing.y, p.facing.x);
  const muzzle = { x: p.x + p.facing.x * (p.radius + 4), y: p.y + p.facing.y * (p.radius + 4) };

  const shoot = (kind: "bullet" | "pellet" | "rocket" | "grenade", angle: number, life: number, radius: number) => {
    const speed = def.speed ?? 400;
    w.projectiles.push({
      id: w.nextId++,
      kind,
      x: muzzle.x,
      y: muzzle.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: def.damage,
      radius,
      life,
      blast: def.blast ?? 0,
    });
  };

  switch (def.kind) {
    case "bullet": {
      const angle = baseAngle + (def.spread ? rangeFloat(w.rng, -def.spread / 2, def.spread / 2) : 0);
      shoot("bullet", angle, (def.range ?? 600) / (def.speed ?? 520), 3);
      break;
    }
    case "pellets": {
      const n = def.pellets ?? 1;
      const spread = def.spread ?? 0;
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0 : k / (n - 1) - 0.5;
        shoot("pellet", baseAngle + t * spread, (def.range ?? 180) / (def.speed ?? 520), 3);
      }
      break;
    }
    case "rocket":
      shoot("rocket", baseAngle, (def.range ?? 900) / (def.speed ?? 360), 5);
      break;
    case "grenade":
      shoot("grenade", baseAngle, def.fuse ?? 1, 4);
      break;
    case "barricade":
    case "barrel":
    case "mine": {
      const x = p.x + p.facing.x * PLACEABLE.placeDistance;
      const y = p.y + p.facing.y * PLACEABLE.placeDistance;
      const radius =
        def.kind === "barricade" ? PLACEABLE.barricadeRadius : def.kind === "barrel" ? PLACEABLE.barrelRadius : PLACEABLE.mineRadius;
      if (circleHitsWall(w.map, x, y, radius)) return; // blocked: no ammo spent
      w.placeables.push({
        id: w.nextId++,
        kind: def.kind,
        x,
        y,
        radius,
        hp: def.hp ?? 1,
        arm: def.arm ?? 0,
        fuse: -1,
      });
      if (def.kind === "barricade") w.flow.dirty = true;
      ev.push({ type: "placed", kind: def.kind, x, y });
      break;
    }
  }

  ev.push({ type: "shotFired", weapon: def.id, playerId: p.id });
  p.cooldown = def.cooldown;
  if (Number.isFinite(p.ammo[def.id])) {
    p.ammo[def.id] -= 1;
    if (p.ammo[def.id] <= 0) p.weapon = nextUsableWeapon(w, p);
  }
}
