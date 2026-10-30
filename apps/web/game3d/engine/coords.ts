/**
 * World <-> scene mapping for the 3D client.
 *
 * game-core works in 2D pixels (map 60x40 tiles of 32 px). In Three.js:
 *   1 tile = 32 world px = 1 scene unit
 *   world x -> scene x, world y -> scene z, scene +y is up, ground top is y = 0.
 * So a 10 px player radius is 0.3125 units and the whole map spans 60 x 40 units.
 */
export const PX = 1 / 32;

export const toX = (wx: number): number => wx * PX;
export const toZ = (wy: number): number => wy * PX;

/** Yaw (rotation about +y) that turns a model whose front faces +z towards the 2D direction (dx, dy). */
export const yawOf = (dx: number, dy: number): number => Math.atan2(dx, dy);

/** Shortest-path angle interpolation. */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Small deterministic PRNG for cosmetic variety (stable per map, never used by game-core). */
export function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
