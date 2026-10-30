// Generates the placeholder tileset (public/maps/tiles.png) and the three Tiled JSON maps.
// Run with `pnpm --filter @kampung/web maps`. Open the JSON in Tiled to refine the layouts by hand.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "maps");
mkdirSync(OUT, { recursive: true });

const T = 32;
const W = 60;
const H = 40;

// ---------- tileset ----------
const COLS = 8;
const ROWS = 3;
const GID = {
  grass: 1, dirt: 2, litter: 3, graveSoil: 4, stone: 5, wood: 6, collision: 7,
  fence: 9, banana: 10, houseWall: 11, roof: 12, well: 13, surauWall: 14, surauRoof: 15,
  rubber: 16, smokehouse: 17, lorry: 18, grave: 19, kemboja: 20, post: 21, pelita: 22, bush: 23, flower: 24,
};

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const img = Buffer.alloc(COLS * T * ROWS * T * 4);
function px(x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= COLS * T || y >= ROWS * T) return;
  const i = (y * COLS * T + x) * 4;
  img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = a;
}
function tileOrigin(gid) {
  const i = gid - 1;
  return [(i % COLS) * T, Math.floor(i / COLS) * T];
}
function fillTile(gid, color, noise = 0, seed = gid) {
  const [ox, oy] = tileOrigin(gid);
  const rnd = mulberry(seed * 977);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const n = Math.floor((rnd() - 0.5) * noise);
      px(ox + x, oy + y, [color[0] + n, color[1] + n, color[2] + n, color[3] ?? 255]);
    }
  }
}
function rect(gid, x, y, w, h, color) {
  const [ox, oy] = tileOrigin(gid);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(ox + x + i, oy + y + j, color);
}
function disc(gid, cx, cy, r, color) {
  const [ox, oy] = tileOrigin(gid);
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) px(ox + cx + i, oy + cy + j, color);
}

fillTile(GID.grass, [38, 70, 40], 14);
fillTile(GID.dirt, [122, 58, 44], 14);
fillTile(GID.litter, [78, 62, 38], 18);
fillTile(GID.graveSoil, [52, 48, 56], 12);
fillTile(GID.stone, [96, 96, 100], 10);
fillTile(GID.wood, [120, 84, 50], 10);
fillTile(GID.collision, [255, 0, 0, 90]);

fillTile(GID.fence, [70, 52, 34], 10);
for (let i = 0; i < T; i += 8) rect(GID.fence, i, 0, 3, T, [40, 28, 18]);

function onGrass(gid, base) {
  fillTile(gid, base, 12);
}
onGrass(GID.banana, [38, 70, 40]);
disc(GID.banana, 16, 16, 13, [70, 130, 52]);
disc(GID.banana, 16, 16, 6, [110, 170, 70]);
rect(GID.banana, 14, 20, 4, 10, [90, 66, 40]);

fillTile(GID.houseWall, [140, 100, 62], 12);
for (let y = 6; y < T; y += 8) rect(GID.houseWall, 0, y, T, 2, [96, 66, 40]);
fillTile(GID.roof, [150, 62, 44], 10);
for (let x = 0; x < T; x += 6) rect(GID.roof, x, 0, 2, T, [110, 40, 30]);

fillTile(GID.well, [96, 96, 100], 10);
disc(GID.well, 16, 16, 13, [120, 120, 126]);
disc(GID.well, 16, 16, 8, [18, 28, 46]);

fillTile(GID.surauWall, [214, 208, 190], 8);
rect(GID.surauWall, 12, 8, 8, 18, [60, 110, 80]);
fillTile(GID.surauRoof, [40, 110, 90], 8);
for (let x = 0; x < T; x += 8) rect(GID.surauRoof, x, 0, 2, T, [26, 80, 66]);

onGrass(GID.rubber, [78, 62, 38]);
disc(GID.rubber, 16, 16, 12, [48, 92, 50]);
disc(GID.rubber, 16, 16, 5, [66, 120, 62]);
rect(GID.rubber, 14, 22, 4, 8, [70, 52, 36]);

fillTile(GID.smokehouse, [98, 76, 56], 10);
rect(GID.smokehouse, 0, 0, T, 4, [60, 44, 30]);
rect(GID.smokehouse, 12, 12, 8, 16, [30, 22, 16]);

fillTile(GID.lorry, [60, 90, 120], 8);
rect(GID.lorry, 0, 12, T, 8, [40, 62, 86]);
rect(GID.lorry, 2, 26, 6, 6, [20, 20, 24]);
rect(GID.lorry, 24, 26, 6, 6, [20, 20, 24]);

fillTile(GID.grave, [52, 48, 56], 12);
rect(GID.grave, 9, 6, 14, 20, [150, 150, 156]);
rect(GID.grave, 9, 6, 14, 3, [190, 190, 196]);

fillTile(GID.kemboja, [52, 48, 56], 12);
disc(GID.kemboja, 16, 16, 13, [60, 70, 52]);
for (let i = 0; i < 9; i++) disc(GID.kemboja, 6 + ((i * 7) % 21), 7 + ((i * 11) % 19), 2, [236, 226, 210]);

fillTile(GID.post, [120, 84, 50], 10);
rect(GID.post, 10, 10, 12, 12, [70, 48, 28]);

fillTile(GID.pelita, [0, 0, 0, 0]);
rect(GID.pelita, 15, 8, 2, 18, [70, 52, 34]);
disc(GID.pelita, 16, 7, 4, [255, 190, 70]);

fillTile(GID.bush, [0, 0, 0, 0]);
disc(GID.bush, 16, 18, 8, [48, 96, 52]);

fillTile(GID.flower, [0, 0, 0, 0]);
disc(GID.flower, 10, 12, 2, [240, 240, 240]);
disc(GID.flower, 22, 20, 2, [240, 220, 120]);

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
writeFileSync(join(OUT, "tiles.png"), png(COLS * T, ROWS * T, img));

// ---------- map builder ----------
function newMap(seed, groundGid) {
  return {
    rnd: mulberry(seed),
    ground: new Array(W * H).fill(groundGid),
    decor: new Array(W * H).fill(0),
    solid: new Array(W * H).fill(0),
    lights: [],
  };
}
const idx = (x, y) => y * W + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

function put(m, x, y, gid, solid = true) {
  if (!inBounds(x, y)) return;
  m.decor[idx(x, y)] = gid;
  m.solid[idx(x, y)] = solid ? 1 : 0;
}
function block(m, x, y, w, h, gid, topGid = gid) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(m, x + i, y + j, j === 0 ? topGid : gid);
}
function floor(m, x, y, w, h, gid) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (inBounds(x + i, y + j)) m.ground[idx(x + i, y + j)] = gid;
}
function border(m) {
  for (let x = 0; x < W; x++) { put(m, x, 0, GID.fence); put(m, x, H - 1, GID.fence); }
  for (let y = 0; y < H; y++) { put(m, 0, y, GID.fence); put(m, W - 1, y, GID.fence); }
}
const CENTER = { x: 30, y: 20 };
function nearCenter(x, y, r = 5) {
  return Math.abs(x - CENTER.x) <= r && Math.abs(y - CENTER.y) <= r;
}
const SPAWN_TILES = [[2, 2], [57, 2], [2, 37], [57, 37], [30, 2], [30, 37], [2, 19], [57, 19]];
function nearSpawn(x, y) {
  return SPAWN_TILES.some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2);
}
function free(m, x, y) {
  return inBounds(x, y) && !m.solid[idx(x, y)] && !nearCenter(x, y) && !nearSpawn(x, y) && x > 0 && y > 0 && x < W - 1 && y < H - 1;
}
function scatter(m, count, gid, accept) {
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 40) {
    const x = 1 + Math.floor(m.rnd() * (W - 2));
    const y = 1 + Math.floor(m.rnd() * (H - 2));
    if (!free(m, x, y) || !accept(x, y)) continue;
    // keep scattered blockers from touching each other, so they never wall off an area
    let touching = false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inBounds(x + i, y + j) && m.solid[idx(x + i, y + j)] && !(i === 0 && j === 0)) touching = true;
    if (touching) continue;
    put(m, x, y, gid, true);
    placed++;
  }
}
function lampAt(m, x, y) {
  put(m, x, y, GID.pelita, false);
  m.lights.push({ x: x * T + T / 2, y: y * T + T / 2 });
}

function reachable(m) {
  const seen = new Uint8Array(W * H);
  const q = [idx(CENTER.x, CENTER.y)];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % W, y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny) || seen[idx(nx, ny)] || m.solid[idx(nx, ny)]) continue;
      seen[idx(nx, ny)] = 1;
      q.push(idx(nx, ny));
    }
  }
  return seen;
}

function toTiled(name, m) {
  const seen = reachable(m);
  const spawns = SPAWN_TILES.filter(([x, y]) => !m.solid[idx(x, y)] && seen[idx(x, y)]);
  if (spawns.length < SPAWN_TILES.length) throw new Error(`${name}: ${SPAWN_TILES.length - spawns.length} spawn(s) unreachable`);
  let id = 1;
  const tile = (name2, data, visible = true) => ({ id: id++, name: name2, type: "tilelayer", x: 0, y: 0, width: W, height: H, opacity: 1, visible, data });
  const points = (name2, pts) => ({
    id: id++, name: name2, type: "objectgroup", x: 0, y: 0, opacity: 1, visible: true, draworder: "topdown",
    objects: pts.map((p, i) => ({ id: 1000 * id + i, name: "", type: "", x: p.x, y: p.y, width: 0, height: 0, rotation: 0, point: true, visible: true })),
  });
  const layers = [
    tile("ground", m.ground),
    tile("decor", m.decor),
    tile("collision", m.solid.map((s) => (s ? GID.collision : 0)), false),
    points("spawns", spawns.map(([x, y]) => ({ x: x * T + T / 2, y: y * T + T / 2 }))),
    points("lights", m.lights),
    points("playerStart", [{ x: CENTER.x * T - 16, y: CENTER.y * T + 16 }, { x: CENTER.x * T + 16, y: CENTER.y * T + 16 }]),
  ];
  const json = {
    compressionlevel: -1, height: H, width: W, infinite: false, layers, nextlayerid: id, nextobjectid: 100000,
    orientation: "orthogonal", renderorder: "right-down", tiledversion: "1.10.2", tileheight: T, tilewidth: T, type: "map", version: "1.10",
    tilesets: [{
      firstgid: 1, name: "placeholder", tilewidth: T, tileheight: T, tilecount: COLS * ROWS, columns: COLS,
      image: "tiles.png", imagewidth: COLS * T, imageheight: ROWS * T, margin: 0, spacing: 0,
    }],
  };
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(json));
  const open = m.solid.filter((s) => !s).length;
  console.log(`${name}: ${open} open tiles, ${m.lights.length} lamps`);
}

// ---------- Kampung Pisang ----------
{
  const m = newMap(11, GID.grass);
  floor(m, 1, 19, W - 2, 2, GID.dirt);
  floor(m, 29, 1, 2, H - 2, GID.dirt);
  floor(m, 6, 10, 20, 2, GID.dirt);
  floor(m, 36, 28, 20, 2, GID.dirt);
  border(m);
  for (const [x, y] of [[6, 4], [14, 4], [44, 4], [51, 4], [6, 26], [14, 29], [38, 31], [47, 24], [52, 31]]) block(m, x, y, 5, 4, GID.houseWall, GID.roof);
  block(m, 34, 8, 7, 5, GID.surauWall, GID.surauRoof);
  block(m, 20, 13, 2, 2, GID.well);
  scatter(m, 46, GID.banana, (x, y) => m.ground[idx(x, y)] === GID.grass);
  for (const [x, y] of [[28, 18], [31, 18], [28, 22], [31, 22], [12, 9], [40, 14], [20, 28], [50, 20]]) lampAt(m, x, y);
  toTiled("kampung-pisang", m);
}

// ---------- Kebun Getah ----------
{
  const m = newMap(23, GID.litter);
  floor(m, 1, 19, W - 2, 2, GID.dirt);
  floor(m, 29, 1, 2, H - 2, GID.dirt);
  border(m);
  for (let x = 6; x <= 46; x += 4) {
    if (x === 30) continue;
    for (let y = 3; y <= 36; y += 2) {
      if (y >= 16 && y <= 23) continue;
      if (nearSpawn(x, y)) continue;
      put(m, x, y, GID.rubber);
    }
  }
  block(m, 51, 4, 6, 4, GID.smokehouse);
  block(m, 51, 31, 6, 4, GID.smokehouse);
  block(m, 51, 12, 5, 2, GID.lorry);
  scatter(m, 8, GID.rubber, (x) => x > 48 || x < 4);
  for (const [x, y] of [[28, 18], [31, 18], [28, 22], [31, 22], [48, 10], [48, 30], [8, 19], [52, 20]]) lampAt(m, x, y);
  toTiled("kebun-getah", m);
}

// ---------- Tanah Perkuburan Lama ----------
{
  const m = newMap(37, GID.graveSoil);
  floor(m, 1, 19, W - 2, 2, GID.stone);
  floor(m, 29, 1, 2, H - 2, GID.stone);
  border(m);
  for (let x = 6; x <= 54; x += 3) {
    for (let y = 5; y <= 34; y += 4) {
      if (x >= 28 && x <= 31) continue;
      if (y >= 17 && y <= 22) continue;
      if (nearSpawn(x, y) || m.rnd() < 0.22) continue;
      put(m, x, y, GID.grave);
    }
  }
  for (const [wx, wy] of [[12, 10], [42, 27], [46, 8]]) {
    floor(m, wx, wy, 4, 3, GID.wood);
    for (const [px2, py2] of [[wx, wy], [wx + 3, wy], [wx, wy + 2], [wx + 3, wy + 2]]) put(m, px2, py2, GID.post);
  }
  scatter(m, 16, GID.kemboja, () => true);
  for (const [x, y] of [[28, 18], [31, 18], [28, 22], [31, 22], [13, 12], [44, 29], [20, 31], [48, 12]]) lampAt(m, x, y);
  toTiled("tanah-perkuburan", m);
}
