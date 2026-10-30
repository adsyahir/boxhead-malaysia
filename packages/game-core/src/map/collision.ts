import type { MapData } from "./map-data";
import type { Vec } from "../types";

export function isSolidCell(map: MapData, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= map.cols || cy >= map.rows) return true;
  return map.solid[cy * map.cols + cx] === 1;
}

export function pointSolid(map: MapData, x: number, y: number): boolean {
  return isSolidCell(map, Math.floor(x / map.tileSize), Math.floor(y / map.tileSize));
}

export function circleHitsWall(map: MapData, x: number, y: number, r: number): boolean {
  const ts = map.tileSize;
  const x0 = Math.floor((x - r) / ts);
  const x1 = Math.floor((x + r) / ts);
  const y0 = Math.floor((y - r) / ts);
  const y1 = Math.floor((y + r) / ts);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (!isSolidCell(map, cx, cy)) continue;
      const nx = Math.max(cx * ts, Math.min(x, (cx + 1) * ts));
      const ny = Math.max(cy * ts, Math.min(y, (cy + 1) * ts));
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}

/** Move a circle by (dx, dy), resolving each axis separately so it slides along walls. */
export function moveCircle(map: MapData, x: number, y: number, r: number, dx: number, dy: number): Vec {
  let nx = x;
  let ny = y;
  if (dx !== 0 && !circleHitsWall(map, x + dx, y, r)) nx = x + dx;
  if (dy !== 0 && !circleHitsWall(map, nx, y + dy, r)) ny = y + dy;
  return { x: nx, y: ny };
}
