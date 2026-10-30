import { BALANCE } from "../data/balance";
import { weaponStats } from "../data/progression";
import { PLACEABLE, WEAPONS } from "../data/weapons";
import { circleHitsWall, moveCircle, pointSolid } from "../map/collision";
import { rangeFloat } from "../rng";
import { WEAPON_IDS, type GameEvent, type Player, type PlayerInput, type Vec, type World } from "../types";
import { damageEnemy } from "./combat";

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

    if (input.select !== undefined) {
      const wanted = WEAPON_IDS[input.select];
      if (wanted && hasAmmo(p, w, wanted)) p.weapon = wanted;
    }
    if (input.switchWeapon && !p.prevSwitch) p.weapon = nextUsableWeapon(w, p);
    p.prevSwitch = input.switchWeapon;

    p.cooldown = Math.max(0, p.cooldown - dt);
    if (input.fire && p.cooldown <= 1e-9) fire(w, p, ev);
  });
}

const BEAM_STEP = 4;
const BEAM_MAX = 2000;

/** Instant piercing line (Senapang Kilat): hits every enemy along it, stops at the first wall. */
function fireBeam(w: World, from: Vec, angle: number, range: number, damage: number, ev: GameEvent[]): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const limit = Math.min(range, BEAM_MAX);
  let len = 0;
  while (len < limit && !pointSolid(w.map, from.x + dx * (len + BEAM_STEP), from.y + dy * (len + BEAM_STEP))) len += BEAM_STEP;

  for (const e of w.enemies) {
    if (e.hp <= 0 || e.rise > 0) continue;
    const t = (e.x - from.x) * dx + (e.y - from.y) * dy;
    if (t < 0 || t > len + e.radius) continue;
    const off = Math.abs((e.x - from.x) * dy - (e.y - from.y) * dx);
    if (off <= e.radius + 3) damageEnemy(w, e, damage, ev);
  }
  for (const b of w.placeables) {
    if (b.kind !== "barrel" || b.hp <= 0) continue;
    const t = (b.x - from.x) * dx + (b.y - from.y) * dy;
    const off = Math.abs((b.x - from.x) * dy - (b.y - from.y) * dx);
    if (t >= 0 && t <= len + b.radius && off <= b.radius + 3) b.fuse = 0;
  }
  ev.push({ type: "beam", x1: from.x, y1: from.y, x2: from.x + dx * len, y2: from.y + dy * len });
}

function fire(w: World, p: Player, ev: GameEvent[]): void {
  const def = WEAPONS[p.weapon];
  if (p.ammo[def.id] <= 0) {
    p.weapon = nextUsableWeapon(w, p);
    return;
  }
  const st = weaponStats(def.id, w.level);
  const baseAngle = Math.atan2(p.facing.y, p.facing.x);
  const muzzle = { x: p.x + p.facing.x * (p.radius + 4), y: p.y + p.facing.y * (p.radius + 4) };
  /** Seconds a projectile with this reach stays in the air; "infinite" still ends at the first wall. */
  const lifeFor = (speed: number): number => (Number.isFinite(st.range) ? st.range / speed : 4);

  const shoot = (kind: "bullet" | "pellet" | "rocket" | "grenade", angle: number, life: number, radius: number) => {
    const speed = def.speed ?? 400;
    w.projectiles.push({
      id: w.nextId++,
      kind,
      x: muzzle.x,
      y: muzzle.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: st.damage,
      radius,
      life,
      blast: st.blast,
      cluster: st.cluster,
    });
  };

  switch (def.kind) {
    case "bullet": {
      const angle = baseAngle + (st.spread ? rangeFloat(w.rng, -st.spread / 2, st.spread / 2) : 0);
      shoot("bullet", angle, lifeFor(def.speed ?? 520), 3);
      break;
    }
    case "pellets": {
      const n = st.pellets;
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0 : k / (n - 1) - 0.5;
        shoot("pellet", baseAngle + t * st.spread, lifeFor(def.speed ?? 520), 3);
      }
      break;
    }
    case "rocket":
      shoot("rocket", baseAngle, lifeFor(def.speed ?? 360), 5);
      break;
    case "grenade":
      shoot("grenade", baseAngle, def.fuse ?? 1, 4);
      break;
    case "beam":
      fireBeam(w, muzzle, baseAngle, st.range, st.damage, ev);
      break;
    case "barricade":
    case "barrel":
    case "mine":
    case "charge": {
      const x = p.x + p.facing.x * PLACEABLE.placeDistance;
      const y = p.y + p.facing.y * PLACEABLE.placeDistance;
      const radius =
        def.kind === "barricade"
          ? PLACEABLE.barricadeRadius
          : def.kind === "barrel"
            ? PLACEABLE.barrelRadius
            : def.kind === "charge"
              ? PLACEABLE.chargeRadius
              : PLACEABLE.mineRadius;
      if (circleHitsWall(w.map, x, y, radius)) return; // blocked: no ammo spent
      w.placeables.push({
        id: w.nextId++,
        kind: def.kind,
        x,
        y,
        radius,
        hp: def.hp ?? 1,
        arm: def.arm ?? 0,
        // a dropped charge starts its countdown at once; barrels wait to be shot
        fuse: def.kind === "charge" ? (def.fuse ?? 2) : -1,
      });
      if (def.kind === "barricade") w.flow.dirty = true;
      ev.push({ type: "placed", kind: def.kind, x, y });
      break;
    }
  }

  ev.push({ type: "shotFired", weapon: def.id, playerId: p.id });
  p.cooldown = st.cooldown;
  if (Number.isFinite(p.ammo[def.id])) {
    p.ammo[def.id] -= 1;
    if (p.ammo[def.id] <= 0) p.weapon = nextUsableWeapon(w, p);
  }
}
