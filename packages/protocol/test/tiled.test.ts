import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAP_IDS, tiledToMapData, type TiledMapJson } from "../src";

const load = (id: string) => JSON.parse(readFileSync(new URL(`../../../apps/web/public/maps/${id}.json`, import.meta.url), "utf8")) as TiledMapJson;

describe("tiledToMapData", () => {
  it.each(MAP_IDS)("parses %s", (id) => {
    const m = tiledToMapData(load(id));
    expect(m).toMatchObject({ cols: 60, rows: 40, tileSize: 32 });
    expect(m.solid).toHaveLength(2400);
    expect(m.spawns.length).toBeGreaterThanOrEqual(6);
    expect(m.playerStarts).toHaveLength(2);
    for (const s of [...m.spawns, ...m.playerStarts]) {
      expect(m.solid[Math.floor(s.y / 32) * 60 + Math.floor(s.x / 32)]).toBe(0);
    }
  });

  it("rejects a map without a layer or spawns", () => {
    expect(() => tiledToMapData({ width: 1, height: 1, tilewidth: 32, layers: [] })).toThrow(/layer/);
    const m = load("kampung-pisang");
    m.layers = m.layers.map((l) => (l.name === "spawns" ? { ...l, objects: [] } : l));
    expect(() => tiledToMapData(m)).toThrow(/spawn/);
  });
});
