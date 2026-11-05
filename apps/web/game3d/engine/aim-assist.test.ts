import type { Enemy, MapData } from "@kampung/game-core";
import { describe, expect, it } from "vitest";
import { ASSIST_RANGE, assistedAim } from "./aim-assist";

/** 40x40 open map, 32 px tiles; `walls` lists solid cells as [col, row]. */
function map(walls: [number, number][] = []): MapData {
  const cols = 40;
  const solid = new Uint8Array(cols * cols);
  for (const [c, r] of walls) solid[r * cols + c] = 1;
  return { cols, rows: cols, tileSize: 32, solid } as unknown as MapData;
}

const ghost = (x: number, y: number, more: Partial<Enemy> = {}) => ({ x, y, hp: 10, rise: 0, ...more }) as Enemy;

describe("assistedAim", () => {
  it("takes the nearest ghost on any side when the player gives no aim", () => {
    expect(assistedAim(map(), 500, 500, [ghost(700, 500), ghost(500, 400)])).toEqual({ x: 0, y: -1 });
  });

  it("leaves the aim alone when no ghost is in range", () => {
    expect(assistedAim(map(), 500, 500, [ghost(500 + ASSIST_RANGE + 1, 500)])).toBeNull();
    expect(assistedAim(map(), 500, 500, [])).toBeNull();
  });

  it("with an aim given, only pulls towards ghosts near that direction", () => {
    const left = ghost(400, 500);
    const right = ghost(700, 520);
    const aim = assistedAim(map(), 500, 500, [left, right], 1, 0)!;
    expect(aim.x).toBeGreaterThan(0.99);
    expect(aim.y).toBeGreaterThan(0); // locked on to the ghost slightly below the aim line
    expect(assistedAim(map(), 500, 500, [left], 1, 0)).toBeNull(); // behind you: your aim wins
  });

  it("treats a stick inside the dead zone as no aim", () => {
    expect(assistedAim(map(), 500, 500, [ghost(400, 500)], 0.1, 0)).toEqual({ x: -1, y: 0 });
  });

  it("skips ghosts behind a wall, still rising, or dead", () => {
    const wall = map([[18, 15]]); // the cell at x 576-608, y 480-512
    expect(assistedAim(wall, 500, 500, [ghost(700, 500)])).toBeNull();
    expect(assistedAim(map(), 500, 500, [ghost(600, 500, { rise: 0.5 })])).toBeNull();
    expect(assistedAim(map(), 500, 500, [ghost(600, 500, { hp: 0 })])).toBeNull();
  });
});
