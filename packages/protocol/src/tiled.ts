import type { MapData, Vec } from "@kampung/game-core";

interface TiledLayer {
  name: string;
  data?: number[];
  objects?: { x: number; y: number }[];
}

export interface TiledMapJson {
  width: number;
  height: number;
  tilewidth: number;
  layers: TiledLayer[];
}

/**
 * Tiled JSON -> the plain MapData game-core understands. Shared by the server (authoritative sim) and the
 * web client (rendering) so both always agree on walls, spawns and start points.
 */
export function tiledToMapData(json: TiledMapJson): MapData {
  const layer = (name: string): TiledLayer => {
    const l = json.layers.find((x) => x.name === name);
    if (!l) throw new Error(`Map is missing layer "${name}"`);
    return l;
  };
  const points = (name: string): Vec[] => (layer(name).objects ?? []).map((o) => ({ x: o.x, y: o.y }));

  const data: MapData = {
    cols: json.width,
    rows: json.height,
    tileSize: json.tilewidth,
    solid: (layer("collision").data ?? []).map((g) => (g > 0 ? 1 : 0)),
    spawns: points("spawns"),
    playerStarts: points("playerStart"),
  };
  if (data.solid.length !== data.cols * data.rows) throw new Error("Collision layer size does not match the map size");
  if (data.spawns.length === 0) throw new Error("Map has no spawn points");
  if (data.playerStarts.length === 0) throw new Error("Map has no player start");
  return data;
}
