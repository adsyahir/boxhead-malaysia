import { BALANCE } from "../data/balance";
import { isSolidCell } from "../map/collision";
import type { Vec, World } from "../types";

function blockedMask(w: World): Uint8Array {
  const { cols, rows, tileSize, solid } = w.map;
  const mask = new Uint8Array(cols * rows);
  for (let i = 0; i < mask.length; i++) mask[i] = solid[i] === 1 ? 1 : 0;
  for (const b of w.placeables) {
    if (b.kind !== "barricade" || b.hp <= 0) continue;
    const cx = Math.floor(b.x / tileSize);
    const cy = Math.floor(b.y / tileSize);
    if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) mask[cy * cols + cx] = 1;
  }
  return mask;
}

export function buildFlow(w: World): void {
  const { cols, rows, tileSize } = w.map;
  const dist = w.flow.dist;
  dist.fill(-1);
  const blocked = blockedMask(w);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  for (const p of w.players) {
    if (!p.alive) continue;
    const cx = Math.floor(p.x / tileSize);
    const cy = Math.floor(p.y / tileSize);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
    const i = cy * cols + cx;
    if (dist[i] === 0) continue;
    dist[i] = 0;
    queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++]!;
    const cx = i % cols;
    const cy = (i - cx) / cols;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx = cx + ox;
        const ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (dist[ni] !== -1 || blocked[ni]) continue;
        // No corner cutting: a diagonal step needs both orthogonal neighbours open.
        if (ox !== 0 && oy !== 0 && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
        dist[ni] = dist[i]! + 1;
        queue[tail++] = ni;
      }
    }
  }
  w.flow.dirty = false;
  w.flow.timer = BALANCE.flowInterval;
}

export function updateFlow(w: World, dt: number): void {
  w.flow.timer -= dt;
  if (w.flow.dirty || w.flow.timer <= 0) buildFlow(w);
}

/** Unit vector toward the best neighbouring cell, or null if unreachable / already at the goal. */
export function flowDirection(w: World, x: number, y: number): Vec | null {
  const { cols, tileSize } = w.map;
  const cx = Math.floor(x / tileSize);
  const cy = Math.floor(y / tileSize);
  if (isSolidCell(w.map, cx, cy)) return null;
  const here = w.flow.dist[cy * cols + cx];
  if (here === undefined || here <= 0) return null;
  let best = here;
  let bx = 0;
  let by = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (ox === 0 && oy === 0) continue;
      const nx = cx + ox;
      const ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= w.map.rows) continue;
      const d = w.flow.dist[ny * cols + nx]!;
      if (d < 0 || d >= best) continue;
      if (ox !== 0 && oy !== 0) {
        const a = w.flow.dist[cy * cols + nx]!;
        const b = w.flow.dist[ny * cols + cx]!;
        if (a < 0 || b < 0) continue;
      }
      best = d;
      bx = ox;
      by = oy;
    }
  }
  if (bx === 0 && by === 0) return null;
  const tx = (cx + bx + 0.5) * tileSize - x;
  const ty = (cy + by + 0.5) * tileSize - y;
  const len = Math.hypot(tx, ty) || 1;
  return { x: tx / len, y: ty / len };
}
