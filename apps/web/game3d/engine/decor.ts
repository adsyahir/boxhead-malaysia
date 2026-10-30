import * as THREE from "three";
import { jitter, type BoxList } from "./batch";

/**
 * Procedural voxel builders for the map's decor. Every builder writes unit-box instances into
 * `lit` (Lambert, fades near players) and `glow` (unlit, windows/flames). Coordinates are scene
 * units: one tile = one unit, ground top at y = 0. Rects are tile footprints from the collision layer,
 * and every solid builder fills its footprint so what you see is what blocks you.
 */
export interface Out {
  lit: BoxList;
  glow: BoxList;
  rnd: () => number;
}

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

const pick = <T,>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length) % list.length]!;

const WOOD_DARK = 0x3a2616;
const WARM_WINDOW = 0xffb255;

/** Two slanted slabs meeting at a ridge along x, plus a stepped attic fill and ridge cap. */
function gableRoof(o: Out, r: Rect, baseY: number, color: number, fill: number, pitch = 0.58, overhang = 0.3): number {
  const cx = r.x + r.w / 2;
  const cz = r.z + r.d / 2;
  const hd = r.d / 2 + overhang;
  const rise = hd * Math.tan(pitch);
  const slabLen = hd / Math.cos(pitch);
  const len = r.w + overhang * 2;
  const rib = new THREE.Color(color).multiplyScalar(0.7);
  for (const side of [1, -1]) {
    const y = baseY + rise / 2 + 0.05;
    const z = cz + (side * hd) / 2;
    o.lit.box(jitter(color, o.rnd, 0.05), cx, y, z, len, 0.1, slabLen + 0.02, side * pitch, 0, 0);
    // corrugation / attap ribs running down the slope
    const ny = Math.cos(pitch) * 0.06;
    const nz = side * Math.sin(pitch) * 0.06;
    for (let x = r.x - overhang + 0.25; x < r.x + r.w + overhang - 0.1; x += 0.42) {
      o.lit.box(rib, x, y + ny, z + nz, 0.07, 0.04, slabLen, side * pitch, 0, 0);
    }
    // eave board
    o.lit.box(0x2a1a10, cx, baseY + 0.02, cz + side * hd, len, 0.12, 0.06);
  }
  // Attic: stepped boxes so the gable ends are closed.
  const steps = 5;
  const inner = r.d / 2 - 0.04;
  for (let k = 0; k < steps; k++) {
    const t = (k + 0.5) / steps;
    const depth = 2 * inner * (1 - t);
    o.lit.box(fill, cx, baseY + (k + 0.5) * (rise / steps) - 0.02, cz, r.w - 0.08, rise / steps + 0.01, Math.max(0.05, depth));
  }
  o.lit.box(0x2a1a10, cx, baseY + rise + 0.08, cz, len + 0.02, 0.08, 0.16);
  return baseY + rise;
}

/** Rumah kampung on stilts: lattice plinth, plank walls with lit windows, gable roof with silang gunting. */
export function house(o: Out, r: Rect): void {
  const rnd = o.rnd;
  const wallC = pick(rnd, [0x8b5a2b, 0x9c6a3a, 0x744a28, 0xb68652, 0x6e7f5c, 0x8f6a4a] as const);
  const roofC = pick(rnd, [0x9a3b2a, 0x7c838c, 0x6a5038, 0x5a6470, 0x8a2f24, 0x7a6a50] as const);
  const cx = r.x + r.w / 2;
  const cz = r.z + r.d / 2;
  const plinth = 0.55;
  const wallTop = 1.65;

  // plinth: dark skirt filling the footprint + stilt posts on the perimeter
  o.lit.box(0x21150c, cx, plinth / 2, cz, r.w - 0.12, plinth, r.d - 0.12);
  for (let i = 0; i <= r.w; i++) {
    for (const z of [r.z + 0.06, r.z + r.d - 0.06]) o.lit.box(WOOD_DARK, Math.min(r.x + r.w - 0.06, Math.max(r.x + 0.06, r.x + i)), plinth / 2, z, 0.14, plinth, 0.14);
  }
  for (let j = 1; j < r.d; j++) {
    for (const x of [r.x + 0.06, r.x + r.w - 0.06]) o.lit.box(WOOD_DARK, x, plinth / 2, r.z + j, 0.14, plinth, 0.14);
  }
  // lattice slats on the front skirt
  for (let i = 0; i < r.w * 3; i++) o.lit.box(0x4a3220, r.x + 0.2 + i / 3, plinth / 2, r.z + r.d - 0.07, 0.05, plinth - 0.12, 0.03);
  // floor slab
  o.lit.box(0x5a3a20, cx, plinth + 0.05, cz, r.w, 0.1, r.d);
  // walls
  const wh = wallTop - plinth - 0.1;
  const wy = plinth + 0.1 + wh / 2;
  o.lit.box(jitter(wallC, rnd, 0.04), cx, wy, cz, r.w - 0.1, wh, r.d - 0.1);
  for (let k = 1; k < 4; k++) {
    o.lit.box(jitter(wallC, rnd, 0.02).multiplyScalar(0.72), cx, plinth + 0.1 + (k * wh) / 4, cz, r.w - 0.06, 0.035, r.d - 0.06);
  }
  for (const [x, z] of [[r.x + 0.05, r.z + 0.05], [r.x + r.w - 0.05, r.z + 0.05], [r.x + 0.05, r.z + r.d - 0.05], [r.x + r.w - 0.05, r.z + r.d - 0.05]] as const) {
    o.lit.box(WOOD_DARK, x, wy, z, 0.12, wh, 0.12);
  }
  // windows front/back, with shutters
  const winY = plinth + 0.1 + wh * 0.55;
  const winXs = r.w >= 5 ? [r.x + 0.9, r.x + r.w - 0.9] : [r.x + r.w / 2];
  const doorX = r.x + r.w / 2;
  for (const face of [1, -1]) {
    const fz = face > 0 ? r.z + r.d - 0.04 : r.z + 0.04;
    for (const wx of winXs) {
      const lit = rnd() < 0.7;
      (lit ? o.glow : o.lit).box(lit ? jitter(WARM_WINDOW, rnd, 0.12) : 0x140d07, wx, winY, fz, 0.42, 0.36, 0.04);
      o.lit.box(0x2e4637, wx - 0.31, winY, fz + face * 0.02, 0.18, 0.4, 0.03);
      o.lit.box(0x2e4637, wx + 0.31, winY, fz + face * 0.02, 0.18, 0.4, 0.03);
      o.lit.box(WOOD_DARK, wx, winY - 0.22, fz + face * 0.02, 0.5, 0.05, 0.05);
    }
    if (face > 0) {
      o.lit.box(0x2a1a0e, doorX, plinth + 0.1 + 0.4, fz + 0.01, 0.42, 0.8, 0.04);
      o.glow.box(0xd08a3a, doorX, plinth + 0.1 + 0.4, fz + 0.015, 0.06, 0.7, 0.03);
      // tangga: two steps tucked against the skirt
      o.lit.box(0x6b4526, doorX, 0.18, r.z + r.d - 0.12, 0.7, 0.06, 0.18);
      o.lit.box(0x6b4526, doorX, 0.38, r.z + r.d - 0.2, 0.7, 0.06, 0.18);
    }
  }
  // side windows
  for (const fx of [r.x + 0.04, r.x + r.w - 0.04]) {
    const lit = rnd() < 0.5;
    (lit ? o.glow : o.lit).box(lit ? WARM_WINDOW : 0x140d07, fx, winY, cz, 0.04, 0.34, 0.4);
  }
  const ridge = gableRoof(o, r, wallTop, roofC, jitter(wallC, rnd, 0.03).multiplyScalar(0.85).getHex());
  // silang gunting at both gable ends
  for (const ex of [r.x - 0.28, r.x + r.w + 0.28]) {
    o.lit.box(0x2a1a10, ex, ridge + 0.12, cz - 0.12, 0.05, 0.55, 0.05, -0.75, 0, 0);
    o.lit.box(0x2a1a10, ex, ridge + 0.12, cz + 0.12, 0.05, 0.55, 0.05, 0.75, 0, 0);
  }
}

/** Surau: white walls, green tiered roof, small gold kubah with a glowing crescent. */
export function surau(o: Out, r: Rect): void {
  const rnd = o.rnd;
  const cx = r.x + r.w / 2;
  const cz = r.z + r.d / 2;
  const green = 0x2f7a5f;
  o.lit.box(0xa9a291, cx, 0.13, cz, r.w, 0.26, r.d);
  const wallTop = 1.75;
  o.lit.box(0xe2dccb, cx, (0.26 + wallTop) / 2, cz, r.w - 0.12, wallTop - 0.26, r.d - 0.12);
  o.lit.box(0x3d7a62, cx, 0.4, cz, r.w - 0.08, 0.14, r.d - 0.08);
  for (const face of [1, -1]) {
    const fz = face > 0 ? r.z + r.d - 0.05 : r.z + 0.05;
    for (let i = 0; i < r.w - 1; i++) {
      const wx = r.x + 1 + i;
      if (face > 0 && Math.abs(wx - cx) < 0.6) continue;
      o.glow.box(jitter(0xffd890, rnd, 0.08), wx, 1.1, fz, 0.32, 0.55, 0.04);
      o.glow.box(0xffd890, wx, 1.42, fz, 0.2, 0.1, 0.04);
      o.lit.box(green, wx, 0.8, fz + face * 0.02, 0.42, 0.06, 0.05);
    }
    if (face > 0) {
      o.lit.box(0x245e49, cx, 0.85, fz + 0.01, 0.62, 1.1, 0.05);
      o.glow.box(0xffe0a0, cx, 1.48, fz + 0.012, 0.3, 0.14, 0.04);
    }
  }
  for (const fx of [r.x + 0.05, r.x + r.w - 0.05]) {
    for (let j = 1; j < r.d; j++) o.glow.box(0xffd890, fx, 1.1, r.z + j, 0.04, 0.55, 0.3);
  }
  // tiered pyramid roof
  let y = wallTop;
  const layers = 5;
  for (let k = 0; k < layers; k++) {
    const t = k / layers;
    o.lit.box(k === 0 ? 0x24624c : jitter(green, rnd, 0.04), cx, y + 0.1, cz, (r.w + 0.6) * (1 - t * 0.75), 0.2, (r.d + 0.6) * (1 - t * 0.75));
    y += 0.2;
  }
  // upper tier with clerestory windows
  const uw = r.w * 0.36;
  const ud = r.d * 0.42;
  o.lit.box(0xe2dccb, cx, y + 0.25, cz, uw, 0.5, ud);
  o.glow.box(0xffd890, cx, y + 0.25, cz + ud / 2 + 0.005, uw * 0.6, 0.2, 0.02);
  y += 0.5;
  for (let k = 0; k < 3; k++) {
    o.lit.box(green, cx, y + 0.09, cz, (uw + 0.4) * (1 - k * 0.3), 0.18, (ud + 0.4) * (1 - k * 0.3));
    y += 0.18;
  }
  // kubah
  const gold = 0xd4a73a;
  o.lit.box(gold, cx, y + 0.12, cz, 0.46, 0.24, 0.46);
  o.lit.box(gold, cx, y + 0.3, cz, 0.34, 0.14, 0.34);
  o.lit.box(gold, cx, y + 0.42, cz, 0.18, 0.12, 0.18);
  o.lit.box(0x8a8a8a, cx, y + 0.62, cz, 0.04, 0.3, 0.04);
  o.glow.box(0xfff2b0, cx - 0.04, y + 0.86, cz, 0.05, 0.2, 0.05);
  o.glow.box(0xfff2b0, cx + 0.03, y + 0.93, cz, 0.08, 0.05, 0.05);
  o.glow.box(0xfff2b0, cx + 0.03, y + 0.79, cz, 0.08, 0.05, 0.05);
}

/** Perigi: square stone ring, dark water, posts, crossbar, small attap roof and a bucket. */
export function well(o: Out, r: Rect): void {
  const cx = r.x + r.w / 2;
  const cz = r.z + r.d / 2;
  const s = Math.min(r.w, r.d);
  const t = 0.32;
  const h = 0.55;
  const stone = 0x7d7d84;
  o.lit.box(jitter(stone, o.rnd), cx, h / 2, r.z + t / 2 + 0.02, s - 0.04, h, t);
  o.lit.box(jitter(stone, o.rnd), cx, h / 2, r.z + r.d - t / 2 - 0.02, s - 0.04, h, t);
  o.lit.box(jitter(stone, o.rnd), r.x + t / 2 + 0.02, h / 2, cz, t, h, s - 0.04 - 2 * t);
  o.lit.box(jitter(stone, o.rnd), r.x + r.w - t / 2 - 0.02, h / 2, cz, t, h, s - 0.04 - 2 * t);
  o.lit.box(0x9a9aa2, cx, h + 0.03, cz, s, 0.06, s);
  o.lit.box(0x0c1a2c, cx, 0.3, cz, s - 2 * t, 0.04, s - 2 * t);
  o.glow.box(0x1d3550, cx + 0.12, 0.33, cz - 0.1, 0.24, 0.01, 0.1);
  for (const x of [r.x + 0.18, r.x + r.w - 0.18]) o.lit.box(WOOD_DARK, x, 0.85, cz, 0.12, 1.7, 0.12);
  o.lit.box(WOOD_DARK, cx, 1.55, cz, s - 0.2, 0.08, 0.08);
  o.lit.box(0xbfae84, cx, 1.2, cz, 0.02, 0.7, 0.02);
  o.lit.box(0x5a6a7a, cx, 0.85, cz, 0.18, 0.18, 0.18);
  for (const side of [1, -1]) o.lit.box(0x6a5434, cx, 1.88, cz + side * 0.42, s + 0.2, 0.06, 0.95, side * 0.55, 0, 0);
}

/** Rumah asap getah: dark shed, single-slope zinc roof, brick chimney, ember glow. Returns chimney top. */
export function smokehouse(o: Out, r: Rect): { x: number; y: number; z: number } {
  const cx = r.x + r.w / 2;
  const cz = r.z + r.d / 2;
  o.lit.box(0x3d2f22, cx, 0.08, cz, r.w, 0.16, r.d);
  o.lit.box(jitter(0x5a4330, o.rnd, 0.05), cx, 0.85, cz, r.w - 0.1, 1.4, r.d - 0.1);
  for (let i = 0; i <= r.w * 2; i++) o.lit.box(0x3e2d1f, r.x + 0.05 + i * ((r.w - 0.1) / (r.w * 2)), 0.85, r.z + r.d - 0.04, 0.04, 1.4, 0.03);
  o.lit.box(0x150e08, cx - 0.8, 0.65, r.z + r.d - 0.04, 0.7, 1.0, 0.04);
  for (let i = 0; i < 3; i++) o.glow.box(0xff5a1e, r.x + 1 + i * 1.6, 0.22, r.z + r.d - 0.03, 0.5, 0.06, 0.03);
  // sheets of rubber hanging in the doorway
  for (let i = 0; i < 3; i++) o.lit.box(0xb07a3a, cx - 1.0 + i * 0.12, 0.9, r.z + r.d - 0.06, 0.06, 0.5, 0.02);
  o.lit.box(0x6d7279, cx, 1.72, cz, r.w + 0.4, 0.08, r.d + 0.5, 0.18, 0, 0);
  for (let i = 0; i < r.w; i++) o.lit.box(0x5a5f66, r.x + 0.5 + i, 1.74, cz, 0.04, 0.03, r.d + 0.5, 0.18, 0, 0);
  const chx = r.x + r.w - 0.6;
  const chz = r.z + 0.6;
  o.lit.box(0x6a3b2b, chx, 1.4, chz, 0.5, 2.6, 0.5);
  o.lit.box(0x4b2a1f, chx, 2.72, chz, 0.6, 0.1, 0.6);
  return { x: chx, y: 2.8, z: chz };
}

/** Old blue lorry along x, cab at the +x end, rubber sheets on the flatbed. */
export function lorry(o: Out, r: Rect): void {
  const cz = r.z + r.d / 2;
  const x1 = r.x + r.w;
  const blue = 0x3b6fa0;
  const wd = r.d - 0.25;
  // wheels
  for (const wx of [r.x + 0.8, r.x + 2.0, x1 - 0.9]) {
    for (const s of [1, -1]) o.lit.box(0x141416, wx, 0.3, cz + s * (wd / 2 - 0.05), 0.6, 0.6, 0.24);
  }
  o.lit.box(0x1c1c1e, r.x + r.w / 2, 0.45, cz, r.w - 0.2, 0.22, wd - 0.5);
  // cab
  const cabW = 1.35;
  o.lit.box(blue, x1 - cabW / 2 - 0.05, 1.0, cz, cabW, 0.95, wd);
  o.lit.box(0x2d5880, x1 - 0.3, 0.6, cz, 0.5, 0.3, wd - 0.04);
  o.lit.box(blue, x1 - cabW / 2 - 0.12, 1.55, cz, cabW - 0.2, 0.35, wd - 0.08);
  o.lit.box(0x18252f, x1 - 0.06, 1.45, cz, 0.04, 0.32, wd - 0.3);
  o.lit.box(0x18252f, x1 - cabW / 2, 1.5, cz + wd / 2, 0.6, 0.28, 0.03);
  o.lit.box(0x18252f, x1 - cabW / 2, 1.5, cz - wd / 2, 0.6, 0.28, 0.03);
  for (const s of [1, -1]) o.glow.box(0xfff0b0, x1 - 0.04, 0.75, cz + s * (wd / 2 - 0.2), 0.04, 0.12, 0.18);
  o.lit.box(0x9a9a9a, x1 - 0.03, 0.45, cz, 0.06, 0.12, wd);
  // flatbed
  const bedW = r.w - cabW - 0.25;
  const bx = r.x + 0.1 + bedW / 2;
  o.lit.box(0x6b5a44, bx, 0.62, cz, bedW, 0.12, wd);
  for (const s of [1, -1]) o.lit.box(jitter(0x7a5a36, o.rnd), bx, 0.9, cz + s * (wd / 2 - 0.04), bedW, 0.45, 0.06);
  o.lit.box(0x7a5a36, r.x + 0.12, 0.9, cz, 0.06, 0.45, wd);
  for (let i = 0; i < 6; i++) o.lit.box(jitter(0xb07a3a, o.rnd, 0.1), bx - 0.6 + (i % 3) * 0.6, 0.75 + Math.floor(i / 3) * 0.08, cz, 0.55, 0.06, wd - 0.4, 0, 0.1 * (o.rnd() - 0.5), 0);
  o.lit.box(0x8a4a2a, bx + 0.3, 0.95, cz + wd / 2 - 0.035, 0.3, 0.12, 0.01);
}

/** Muslim grave: low kepuk border, soil mound, two batu nisan. */
export function grave(o: Out, cx: number, cz: number): void {
  const rnd = o.rnd;
  const along = rnd() < 0.5 ? 0 : Math.PI / 2;
  const stone = jitter(0x9a9aa2, rnd, 0.1);
  const L = 0.9;
  const W = 0.62;
  const sx = along === 0 ? W : L;
  const sz = along === 0 ? L : W;
  o.lit.box(stone, cx, 0.09, cz, sx, 0.18, sz);
  o.lit.box(0x2c2620, cx, 0.16, cz, sx - 0.14, 0.08, sz - 0.14);
  o.lit.box(0x3a3128, cx, 0.22, cz, sx - 0.3, 0.06, sz - 0.3);
  const tall = 0.45 + rnd() * 0.2;
  const nis = jitter(0xc8c8cc, rnd, 0.1);
  const tilt = (rnd() - 0.5) * 0.25;
  for (const s of [1, -1]) {
    const h = s > 0 ? tall : tall * 0.75;
    const ox = along === 0 ? 0 : s * (L / 2 - 0.12);
    const oz = along === 0 ? s * (L / 2 - 0.12) : 0;
    o.lit.box(nis, cx + ox, h / 2 + 0.1, cz + oz, along === 0 ? 0.22 : 0.08, h, along === 0 ? 0.08 : 0.22, along === 0 ? tilt : 0, 0, along === 0 ? 0 : tilt);
    o.lit.box(nis, cx + ox, h + 0.13, cz + oz, 0.12, 0.08, 0.12);
  }
  if (rnd() < 0.4) o.lit.box(0xe8e2d0, cx, 0.3, cz + (along === 0 ? L / 2 - 0.12 : 0) + 0.06, 0.24, 0.05, 0.02);
}

/** Pokok pisang: thin green trunk, drooping long leaves, a banana bunch, a root clump filling the tile. */
export function bananaTree(o: Out, cx: number, cz: number): void {
  const rnd = o.rnd;
  o.lit.box(0x2c3a1c, cx, 0.08, cz, 0.78, 0.16, 0.78);
  o.lit.box(0x4d5e2a, cx + 0.22, 0.25, cz - 0.15, 0.12, 0.5, 0.12, 0, 0, 0.2);
  const h = 1.55 + rnd() * 0.4;
  o.lit.box(jitter(0x6c7a36, rnd), cx, h / 2, cz, 0.2, h, 0.2, 0, rnd(), 0);
  o.lit.box(0x55682c, cx, h * 0.3, cz, 0.24, 0.14, 0.24);
  const n = 6;
  const base = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const yaw = base + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const pitch = 0.35 + rnd() * 0.45;
    const green = jitter(i % 2 ? 0x4f8f34 : 0x5fa03c, rnd, 0.12);
    o.lit.limb(green, cx, h, cz, 0.32, 0.04, 1.0 + rnd() * 0.25, yaw, pitch);
    o.lit.limb(0x3c6a28, cx, h + 0.01, cz, 0.05, 0.05, 1.0, yaw, pitch);
  }
  o.lit.limb(0x5fa03c, cx, h, cz, 0.18, 0.04, 0.5, base, -1.1);
  o.lit.box(0xb2b24a, cx + 0.16, h - 0.35, cz + 0.08, 0.2, 0.3, 0.2);
  o.lit.box(0x6a2440, cx + 0.2, h - 0.6, cz + 0.12, 0.1, 0.16, 0.1);
}

/** Pokok getah: straight grey trunk with a tapping slash and latex cup, stacked canopy. */
export function rubberTree(o: Out, cx: number, cz: number, tall = 1): void {
  const rnd = o.rnd;
  cx += (rnd() - 0.5) * 0.12;
  cz += (rnd() - 0.5) * 0.12;
  o.lit.box(0x3a2c1e, cx, 0.05, cz, 0.62, 0.1, 0.62);
  const h = (1.8 + rnd() * 0.4) * tall;
  o.lit.box(jitter(0x7a6a58, rnd, 0.1), cx, h / 2, cz, 0.3, h, 0.3);
  o.lit.box(0xd8d0bc, cx, 0.7, cz + 0.152, 0.26, 0.04, 0.01, 0, 0, -0.35);
  o.lit.box(0xe8e4d8, cx, 0.5, cz + 0.2, 0.1, 0.1, 0.1);
  o.lit.box(0x55452f, cx + 0.12, h * 0.75, cz, 0.5, 0.08, 0.08, 0, 0, 0.6);
  const g1 = jitter(0x2f5e30, rnd, 0.12);
  const g2 = jitter(0x3a6e38, rnd, 0.12);
  o.lit.box(g1, cx, h + 0.05, cz, 1.15, 0.42, 1.15, 0, rnd() * 0.6, 0);
  o.lit.box(g2, cx + (rnd() - 0.5) * 0.3, h + 0.42, cz + (rnd() - 0.5) * 0.3, 0.85, 0.38, 0.85, 0, rnd() * 0.6, 0);
  o.lit.box(g1, cx, h + 0.72, cz, 0.55, 0.3, 0.55);
}

/** Pokok kemboja: twisted forked trunk, leaf clumps dotted with white-yellow flowers. */
export function kemboja(o: Out, cx: number, cz: number): void {
  const rnd = o.rnd;
  o.lit.box(0x2a2620, cx, 0.06, cz, 0.7, 0.12, 0.7);
  o.lit.box(0x6e5a48, cx, 0.45, cz, 0.24, 0.9, 0.24);
  const tips: [number, number, number][] = [];
  const base = rnd() * Math.PI * 2;
  for (let i = 0; i < 3; i++) {
    const yaw = base + (i * Math.PI * 2) / 3;
    const pitch = -0.7 - rnd() * 0.3;
    o.lit.limb(0x6e5a48, cx, 0.85, cz, 0.13, 0.13, 0.75, yaw, pitch);
    const dx = Math.sin(yaw) * Math.cos(pitch) * 0.75;
    const dz = Math.cos(yaw) * Math.cos(pitch) * 0.75;
    tips.push([cx + dx, 0.85 + Math.sin(-pitch) * 0.75, cz + dz]);
  }
  for (const [x, y, z] of tips) {
    o.lit.box(jitter(0x3c5a34, rnd, 0.12), x, y + 0.1, z, 0.6, 0.28, 0.6, 0, rnd(), 0);
    for (let k = 0; k < 4; k++) {
      const fx = x + (rnd() - 0.5) * 0.5;
      const fz = z + (rnd() - 0.5) * 0.5;
      o.lit.box(0xf2ecdc, fx, y + 0.26, fz, 0.11, 0.05, 0.11, 0, rnd(), 0);
      o.lit.box(0xf0c850, fx, y + 0.29, fz, 0.04, 0.02, 0.04);
    }
  }
}

/** Kelapa (outside the fence only): tall leaning trunk and drooping fronds. */
export function coconut(o: Out, cx: number, cz: number): void {
  const rnd = o.rnd;
  const lean = (rnd() - 0.5) * 0.3;
  const segs = 6;
  let x = cx;
  let y = 0;
  for (let i = 0; i < segs; i++) {
    o.lit.box(jitter(0x6f5c45, rnd, 0.1), x, y + 0.3, cz, 0.24, 0.62, 0.24, 0, 0, -lean);
    x += Math.sin(lean) * 0.6;
    y += 0.6;
  }
  for (let i = 0; i < 7; i++) {
    const yaw = (i / 7) * Math.PI * 2 + rnd() * 0.3;
    o.lit.limb(jitter(0x3f7a34, rnd, 0.12), x, y, cz, 0.28, 0.04, 1.4, yaw, 0.5 + rnd() * 0.3);
  }
  o.lit.box(0x5a4a24, x, y - 0.15, cz, 0.3, 0.2, 0.3);
}

/** Tiang wakaf: solid post. The roof over the wakaf floor is built separately. */
export function post(o: Out, cx: number, cz: number, top: number): void {
  o.lit.box(0x5a3a20, cx, 0.08, cz, 0.6, 0.16, 0.6);
  o.lit.box(0x6b4526, cx, top / 2, cz, 0.26, top, 0.26);
  o.lit.box(0x4a2e18, cx, top - 0.1, cz, 0.34, 0.12, 0.34);
}

/** Wakaf roof: stepped pyramid over the floor rect, with beams between posts. */
export function wakafRoof(o: Out, r: Rect, top: number): void {
  const cx = r.x + r.w / 2;
  const cz = r.z + r.d / 2;
  o.lit.box(0x4a2e18, cx, top, cz + r.d / 2 - 0.5, r.w - 0.6, 0.1, 0.12);
  o.lit.box(0x4a2e18, cx, top, cz - r.d / 2 + 0.5, r.w - 0.6, 0.1, 0.12);
  for (let k = 0; k < 4; k++) {
    const s = 1 - k * 0.22;
    o.lit.box(k % 2 ? 0x6a4a2a : 0x7a5530, cx, top + 0.12 + k * 0.16, cz, (r.w + 0.4) * s, 0.16, (r.d + 0.4) * s);
  }
  o.lit.box(0x3a2416, cx, top + 0.85, cz, 0.12, 0.2, 0.12);
}

/** Pagar buluh along the map border. `horiz` = runs along x. Fills the tile with two staggered rows. */
export function fence(o: Out, cx: number, cz: number, horiz: boolean, vert: boolean): void {
  const rnd = o.rnd;
  o.lit.box(0x231a10, cx, 0.05, cz, 0.96, 0.1, 0.96);
  const runs: boolean[] = [];
  if (horiz) runs.push(true);
  if (vert || !horiz) runs.push(false);
  for (const h of runs) {
    for (const row of [-0.22, 0.22]) {
      for (let i = 0; i < 4; i++) {
        const t = -0.375 + i * 0.25 + (row > 0 ? 0.06 : -0.06);
        const ph = 0.85 + rnd() * 0.35;
        const px = h ? cx + t : cx + row;
        const pz = h ? cz + row : cz + t;
        o.lit.box(jitter(rnd() < 0.5 ? 0x8a7a3e : 0x6f6232, rnd, 0.12), px, ph / 2, pz, 0.12, ph, 0.12);
        o.lit.box(0x4e4524, px, ph * 0.66, pz, 0.135, 0.03, 0.135);
      }
      for (const ry of [0.35, 0.7]) {
        o.lit.box(0x5a4a26, h ? cx : cx + row, ry, h ? cz + row : cz, h ? 1.0 : 0.06, 0.06, h ? 0.06 : 1.0);
      }
    }
  }
}

/** Pelita: bamboo pole with a burning wick. Returns the flame position for the light. */
export function pelita(o: Out, cx: number, cz: number): { x: number; y: number; z: number } {
  o.lit.box(0x6b5a2e, cx, 0.55, cz, 0.08, 1.1, 0.08);
  o.lit.box(0x3a2c1a, cx, 0.03, cz, 0.24, 0.06, 0.24);
  o.lit.box(0x7a6a36, cx, 1.12, cz, 0.13, 0.12, 0.13);
  o.glow.box(0xffd070, cx, 1.27, cz, 0.08, 0.16, 0.08);
  o.glow.box(0xff8a2a, cx, 1.36, cz, 0.05, 0.08, 0.05);
  return { x: cx, y: 1.32, z: cz };
}

export function bush(o: Out, cx: number, cz: number, scale = 1): void {
  const rnd = o.rnd;
  o.lit.box(jitter(0x2f5e30, rnd, 0.15), cx, 0.16 * scale, cz, 0.6 * scale, 0.32 * scale, 0.55 * scale, 0, rnd(), 0);
  o.lit.box(jitter(0x3a6e38, rnd, 0.15), cx + 0.1 * scale, 0.32 * scale, cz - 0.05, 0.38 * scale, 0.22 * scale, 0.36 * scale, 0, rnd(), 0);
}

export function flower(o: Out, cx: number, cz: number): void {
  const rnd = o.rnd;
  for (let i = 0; i < 3; i++) {
    const x = cx + (rnd() - 0.5) * 0.6;
    const z = cz + (rnd() - 0.5) * 0.6;
    o.lit.box(0x3a6e38, x, 0.06, z, 0.03, 0.12, 0.03);
    o.lit.box(i % 2 ? 0xf0e070 : 0xf2f2f2, x, 0.14, z, 0.08, 0.04, 0.08);
  }
}

/** Fallback for a solid tile with no recognised decor: a mossy stone block. */
export function rock(o: Out, cx: number, cz: number): void {
  o.lit.box(jitter(0x6a6a66, o.rnd, 0.1), cx, 0.35, cz, 0.94, 0.7, 0.94);
  o.lit.box(0x3a5a34, cx, 0.72, cz, 0.8, 0.06, 0.8);
}
