import { BALANCE } from "../data/balance";
import { moveCircle } from "../map/collision";
import type { MapData } from "../map/map-data";
import type { Vec } from "../types";

/** Facing snaps to the nearest of 8 directions. */
export function snap8(x: number, y: number): Vec {
  const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: Math.cos(a), y: Math.sin(a) };
}

export interface Walker {
  x: number;
  y: number;
  radius: number;
  facing: Vec;
}

/** An aim stick shorter than this is ignored, so a quick tap on Fire shoots the way the player already faces. */
export const AIM_DEAD_ZONE = 0.25;

/**
 * One tick of player movement: the stick is clamped to length 1, facing snaps to 8 directions (or follows the aim
 * stick exactly when it is pushed), and the player slides along walls. The simulation and a predicting client both
 * call this, so they cannot drift apart.
 */
export function movePlayer(map: MapData, p: Walker, moveX: number, moveY: number, dt: number, aimX = 0, aimY = 0): void {
  const aimLen = Math.hypot(aimX, aimY);
  const aiming = aimLen >= AIM_DEAD_ZONE;
  if (aiming) p.facing = { x: aimX / aimLen, y: aimY / aimLen };
  let mx = moveX;
  let my = moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  if (len <= 0.01) return;
  if (!aiming) p.facing = snap8(mx, my);
  const next = moveCircle(map, p.x, p.y, p.radius, mx * BALANCE.playerSpeed * dt, my * BALANCE.playerSpeed * dt);
  p.x = next.x;
  p.y = next.y;
}
