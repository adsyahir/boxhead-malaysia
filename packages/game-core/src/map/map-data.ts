import type { Vec } from "../types";

/** Plain map description. The web app converts Tiled JSON into this. */
export interface MapData {
  cols: number;
  rows: number;
  tileSize: number;
  /** cols * rows, 1 = solid. */
  solid: number[];
  spawns: Vec[];
  playerStarts: Vec[];
}

/** Open room with solid border. Handy for tests and the placeholder map. */
export function createBoxMap(cols: number, rows: number, tileSize = 32): MapData {
  const solid: number[] = new Array(cols * rows).fill(0);
  for (let x = 0; x < cols; x++) {
    solid[x] = 1;
    solid[(rows - 1) * cols + x] = 1;
  }
  for (let y = 0; y < rows; y++) {
    solid[y * cols] = 1;
    solid[y * cols + cols - 1] = 1;
  }
  const w = cols * tileSize;
  const h = rows * tileSize;
  return {
    cols,
    rows,
    tileSize,
    solid,
    spawns: [
      { x: tileSize * 2, y: tileSize * 2 },
      { x: w - tileSize * 2, y: tileSize * 2 },
      { x: tileSize * 2, y: h - tileSize * 2 },
      { x: w - tileSize * 2, y: h - tileSize * 2 },
    ],
    playerStarts: [
      { x: w / 2 - 24, y: h / 2 },
      { x: w / 2 + 24, y: h / 2 },
    ],
  };
}
