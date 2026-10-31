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

/**
 * One tick of player movement: the stick is clamped to length 1, facing snaps to 8 directions, and the player slides
 * along walls. The simulation and a predicting client both call this, so they cannot drift apart.
 */
export function movePlayer(map: MapData, p: Walker, moveX: number, moveY: number, dt: number): void {
  let mx = moveX;
  let my = moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  if (len <= 0.01) return;
  p.facing = snap8(mx, my);
  const next = moveCircle(map, p.x, p.y, p.radius, mx * BALANCE.playerSpeed * dt, my * BALANCE.playerSpeed * dt);
  p.x = next.x;
  p.y = next.y;
}
