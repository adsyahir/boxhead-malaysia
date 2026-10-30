import * as THREE from "three";
import type { LoadedMap } from "../../game/maps";
import { BoxList, jitter, type BoxBatch } from "./batch";
import { mulberry } from "./coords";
import * as D from "./decor";
import type { Materials } from "./materials";

/** Tileset gids, same meaning as apps/web/scripts/generate-maps.mjs. */
export const GID = {
  grass: 1, dirt: 2, litter: 3, graveSoil: 4, stone: 5, wood: 6,
  fence: 9, banana: 10, houseWall: 11, roof: 12, well: 13, surauWall: 14, surauRoof: 15,
  rubber: 16, smokehouse: 17, lorry: 18, grave: 19, kemboja: 20, post: 21, pelita: 22, bush: 23, flower: 24,
} as const;

const GROUND: Record<number, { color: number; top: number }> = {
  [GID.grass]: { color: 0x355e30, top: 0 },
  [GID.dirt]: { color: 0x6e3e2c, top: -0.03 },
  [GID.litter]: { color: 0x5a4628, top: 0 },
  [GID.graveSoil]: { color: 0x3e3a40, top: 0 },
  [GID.stone]: { color: 0x707074, top: 0.02 },
  [GID.wood]: { color: 0x7a5432, top: 0.05 },
};

const GROUPS: number[][] = [[GID.houseWall, GID.roof], [GID.surauWall, GID.surauRoof], [GID.well], [GID.smokehouse], [GID.lorry]];

export interface BuiltMap {
  group: THREE.Group;
  /** Pelita flame positions (scene units), for the pooled point lights. */
  lamps: THREE.Vector3[];
  /** Chimney tops that emit cosmetic smoke. */
  chimneys: THREE.Vector3[];
  width: number;
  depth: number;
  dispose(): void;
}

function rects(decor: number[], cols: number, rows: number, gids: number[]): D.Rect[] {
  const seen = new Uint8Array(cols * rows);
  const out: D.Rect[] = [];
  for (let i = 0; i < decor.length; i++) {
    if (seen[i] || !gids.includes(decor[i]!)) continue;
    let x0 = cols, z0 = rows, x1 = 0, z1 = 0;
    const q = [i];
    seen[i] = 1;
    for (let h = 0; h < q.length; h++) {
      const j = q[h]!;
      const x = j % cols;
      const z = (j - x) / cols;
      x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
        const k = nz * cols + nx;
        if (seen[k] || !gids.includes(decor[k]!)) continue;
        seen[k] = 1;
        q.push(k);
      }
    }
    out.push({ x: x0, z: z0, w: x1 - x0 + 1, d: z1 - z0 + 1 });
  }
  return out;
}

export function buildMap(map: LoadedMap, mats: Materials, seed: number): BuiltMap {
  const { cols, rows, solid } = map.data;
  const rnd = mulberry(seed);
  const ground = new BoxList();
  const o: D.Out = { lit: new BoxList(), glow: new BoxList(), rnd };
  const lamps: THREE.Vector3[] = [];
  const chimneys: THREE.Vector3[] = [];
  const decor = map.decor;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= cols || z >= rows ? 0 : decor[z * cols + x]!);
  const covered = new Uint8Array(cols * rows);

  // ---- ground ----
  const theme = map.ground[Math.floor(rows / 3) * cols + 3] ?? GID.grass;
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const gid = map.ground[z * cols + x] ?? GID.grass;
      const g = GROUND[gid] ?? GROUND[GID.grass]!;
      const top = g.top + (rnd() - 0.5) * 0.02;
      const cx = x + 0.5;
      const cz = z + 0.5;
      if (gid === GID.stone) {
        ground.box(0x3a3a3e, cx, -0.16, cz, 1, 0.3, 1);
        ground.box(jitter(g.color, rnd, 0.12), cx, top - 0.06, cz, 0.92, 0.14, 0.92);
      } else if (gid === GID.wood) {
        ground.box(0x2a1a0e, cx, -0.16, cz, 1, 0.3, 1);
        for (let p = 0; p < 3; p++) ground.box(jitter(g.color, rnd, 0.1), cx, top - 0.05, z + 0.17 + p * 0.33, 0.98, 0.1, 0.3);
      } else {
        ground.box(jitter(g.color, rnd, 0.07), cx, top - 0.15, cz, 1, 0.3, 1);
      }
      if (solid[z * cols + x]) continue;
      // cosmetic ground clutter
      if (gid === GID.grass && rnd() < 0.4) {
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) ground.box(jitter(rnd() < 0.5 ? 0x4a7a3a : 0x2c5428, rnd, 0.1), x + 0.15 + rnd() * 0.7, 0.05, z + 0.15 + rnd() * 0.7, 0.05, 0.1 + rnd() * 0.08, 0.05, 0, rnd(), 0.2 * (rnd() - 0.5));
      } else if (gid === GID.litter && rnd() < 0.45) {
        for (let k = 0; k < 2; k++) ground.box(jitter(rnd() < 0.5 ? 0x5e4426 : 0x4a3520, rnd, 0.15), x + 0.1 + rnd() * 0.8, 0.008, z + 0.1 + rnd() * 0.8, 0.16, 0.015, 0.09, 0, rnd() * Math.PI, 0);
      } else if ((gid === GID.dirt || gid === GID.graveSoil) && rnd() < 0.15) {
        ground.box(jitter(0x6a6a66, rnd, 0.15), x + 0.2 + rnd() * 0.6, 0.0, z + 0.2 + rnd() * 0.6, 0.09, 0.06, 0.07, 0, rnd(), 0);
      }
    }
  }

  // ---- grouped structures ----
  for (const gids of GROUPS) {
    for (const r of rects(decor, cols, rows, gids)) {
      for (let z = r.z; z < r.z + r.d; z++) for (let x = r.x; x < r.x + r.w; x++) covered[z * cols + x] = 1;
      const g = gids[0];
      if (g === GID.houseWall) D.house(o, r);
      else if (g === GID.surauWall) D.surau(o, r);
      else if (g === GID.well) D.well(o, r);
      else if (g === GID.smokehouse) {
        const c = D.smokehouse(o, r);
        chimneys.push(new THREE.Vector3(c.x, c.y, c.z));
      } else if (g === GID.lorry) D.lorry(o, r);
    }
  }
  // wakaf roofs over wooden floor patches
  const POST_TOP = 1.55;
  for (const r of rects(map.ground, cols, rows, [GID.wood])) D.wakafRoof(o, r, POST_TOP);

  // ---- per-tile decor ----
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const i = z * cols + x;
      if (covered[i]) continue;
      const gid = decor[i]!;
      const cx = x + 0.5;
      const cz = z + 0.5;
      switch (gid) {
        case GID.fence: {
          const h = at(x - 1, z) === GID.fence || at(x + 1, z) === GID.fence;
          const v = at(x, z - 1) === GID.fence || at(x, z + 1) === GID.fence;
          D.fence(o, cx, cz, h, v);
          break;
        }
        case GID.banana: D.bananaTree(o, cx, cz); break;
        case GID.rubber: D.rubberTree(o, cx, cz); break;
        case GID.grave: D.grave(o, cx, cz); break;
        case GID.kemboja: D.kemboja(o, cx, cz); break;
        case GID.post: D.post(o, cx, cz, POST_TOP); break;
        case GID.pelita: {
          const p = D.pelita(o, cx, cz);
          lamps.push(new THREE.Vector3(p.x, p.y, p.z));
          break;
        }
        case GID.bush: D.bush(o, cx, cz); break;
        case GID.flower: D.flower(o, cx, cz); break;
        default:
          if (solid[i]) D.rock(o, cx, cz);
      }
    }
  }
  // Lamps from the map's light layer that have no pelita tile still get a light.
  for (const l of map.lights) {
    const lx = l.x / map.tileSize;
    const lz = l.y / map.tileSize;
    if (!lamps.some((p) => Math.abs(p.x - lx) < 0.6 && Math.abs(p.z - lz) < 0.6)) lamps.push(new THREE.Vector3(lx, 1.3, lz));
  }

  // ---- outside the fence: dark ground and a ring of trees so the map never ends in a void ----
  const BAND = 9;
  const outsideColor = theme === GID.litter ? 0x3a3020 : theme === GID.graveSoil ? 0x2a2a2c : 0x26402a;
  ground.box(0x111a12, cols / 2, -0.32, rows / 2, cols + BAND * 2 + 80, 0.3, rows + BAND * 2 + 80);
  for (let z = -BAND; z < rows + BAND; z++) {
    for (let x = -BAND; x < cols + BAND; x++) {
      if (x >= 0 && z >= 0 && x < cols && z < rows) continue;
      ground.box(jitter(outsideColor, rnd, 0.12), x + 0.5, -0.17, z + 0.5, 1, 0.3, 1);
      const south = z >= rows;
      const p = rnd();
      const cx = x + 0.3 + rnd() * 0.4;
      const cz = z + 0.3 + rnd() * 0.4;
      const nearEdge = x === -1 || z === -1 || x === cols || z === rows;
      if (south) {
        if (p < 0.25 && !nearEdge) D.bush(o, cx, cz, 0.8 + rnd() * 0.5);
        continue;
      }
      if (p < 0.22) {
        if (theme === GID.litter) D.rubberTree(o, cx, cz, 1.1);
        else if (theme === GID.graveSoil) {
          if (rnd() < 0.5) D.kemboja(o, cx, cz);
          else D.rubberTree(o, cx, cz, 1.2);
        }
        else if (rnd() < 0.45) D.coconut(o, cx, cz);
        else D.bananaTree(o, cx, cz);
      } else if (p < 0.4) D.bush(o, cx, cz, 0.8 + rnd() * 0.6);
    }
  }

  const group = new THREE.Group();
  group.name = "map";
  const batches: BoxBatch[] = [
    ground.toBatch(mats.ground, { receive: true, name: "ground" }),
    o.lit.toBatch(mats.decor, { cast: true, receive: true, name: "decor" }),
    o.glow.toBatch(mats.decorGlow, { name: "decor-glow" }),
  ];
  for (const b of batches) group.add(b.mesh);

  return {
    group,
    lamps,
    chimneys,
    width: cols,
    depth: rows,
    dispose() {
      for (const b of batches) b.dispose();
    },
  };
}
