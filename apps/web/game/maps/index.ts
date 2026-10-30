import type { MapData, Vec } from "@kampung/game-core";

export interface MapInfo {
  key: string;
  name: string;
  blurb: string;
}

export const MAPS: MapInfo[] = [
  { key: "kampung-pisang", name: "Kampung Pisang", blurb: "Rumah kayu, surau, telaga dan lorong tanah merah." },
  { key: "kebun-getah", name: "Kebun Getah", blurb: "Barisan pokok getah. Lorong panjang, jangan terperangkap." },
  { key: "tanah-perkuburan", name: "Tanah Perkuburan Lama", blurb: "Kubur lama dan pokok kemboja. Lebih banyak pontianak." },
];

export interface LoadedMap {
  data: MapData;
  ground: number[];
  decor: number[];
  lights: Vec[];
  tileSize: number;
  pixelWidth: number;
  pixelHeight: number;
}

interface TiledLayer {
  name: string;
  type: "tilelayer" | "objectgroup";
  data?: number[];
  objects?: { x: number; y: number }[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  layers: TiledLayer[];
}

/** Converts Tiled JSON into the plain MapData that game-core understands. */
export function parseTiledMap(json: TiledMap): LoadedMap {
  const layer = (name: string) => {
    const l = json.layers.find((x) => x.name === name);
    if (!l) throw new Error(`Map is missing layer "${name}"`);
    return l;
  };
  const points = (name: string): Vec[] => (layer(name).objects ?? []).map((o) => ({ x: o.x, y: o.y }));

  const collision = layer("collision");
  const solid = (collision.data ?? []).map((g) => (g > 0 ? 1 : 0));
  const data: MapData = {
    cols: json.width,
    rows: json.height,
    tileSize: json.tilewidth,
    solid,
    spawns: points("spawns"),
    playerStarts: points("playerStart"),
  };
  if (data.spawns.length === 0) throw new Error("Map has no spawn points");
  if (data.playerStarts.length === 0) throw new Error("Map has no player start");
  return {
    data,
    ground: layer("ground").data ?? [],
    decor: layer("decor").data ?? [],
    lights: points("lights"),
    tileSize: json.tilewidth,
    pixelWidth: json.width * json.tilewidth,
    pixelHeight: json.height * json.tilewidth,
  };
}
