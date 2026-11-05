import { AIM_DEAD_ZONE, pointSolid, type Enemy, type MapData } from "@kampung/game-core";

/** How far aim assist reaches, world px (about 10 tiles). */
export const ASSIST_RANGE = 320;
/** With a mouse or aim stick in use, only ghosts within this angle of your aim are picked. */
const ASSIST_CONE_COS = Math.cos((25 * Math.PI) / 180);
const SIGHT_STEP = 16;

function canSee(map: MapData, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / SIGHT_STEP);
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    if (pointSolid(map, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return false;
  }
  return true;
}

/**
 * Unit aim at the ghost aim assist should lock on to, or null to leave the player's aim alone. With an aim given
 * (aimX, aimY) it pulls towards the nearest ghost close to that direction; with none (keyboard, or Fire pressed
 * without dragging) it takes the nearest ghost on any side. Ghosts behind walls or still rising are skipped.
 */
export function assistedAim(map: MapData, heroX: number, heroY: number, enemies: readonly Enemy[], aimX = 0, aimY = 0): { x: number; y: number } | null {
  const aimLen = Math.hypot(aimX, aimY);
  const aiming = aimLen >= AIM_DEAD_ZONE;
  let best: { x: number; y: number } | null = null;
  let bestDist = ASSIST_RANGE;
  for (const e of enemies) {
    if (e.hp <= 0 || e.rise > 0) continue;
    const dx = e.x - heroX;
    const dy = e.y - heroY;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > bestDist) continue;
    if (aiming && (dx * aimX + dy * aimY) / (d * aimLen) < ASSIST_CONE_COS) continue;
    if (!canSee(map, heroX, heroY, e.x, e.y)) continue;
    best = { x: dx / d, y: dy / d };
    bestDist = d;
  }
  return best;
}
