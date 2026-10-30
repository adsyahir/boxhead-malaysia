import { tiledToMapData, type MapId, type TiledMapJson } from "@kampung/protocol";
import type { MapData } from "@kampung/game-core";
import kampung from "../../web/public/maps/kampung-pisang.json";
import getah from "../../web/public/maps/kebun-getah.json";
import kubur from "../../web/public/maps/tanah-perkuburan.json";

// Bundled at build time so the server always simulates the exact maps this commit's client renders.
const RAW: Record<MapId, TiledMapJson> = {
  "kampung-pisang": kampung as TiledMapJson,
  "kebun-getah": getah as TiledMapJson,
  "tanah-perkuburan": kubur as TiledMapJson,
};

const cache = new Map<MapId, MapData>();

export function loadMap(id: MapId): MapData {
  let m = cache.get(id);
  if (!m) {
    m = tiledToMapData(RAW[id]);
    cache.set(id, m);
  }
  return m;
}
