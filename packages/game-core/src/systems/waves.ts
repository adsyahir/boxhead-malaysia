import { BALANCE } from "../data/balance";
import { ENEMIES } from "../data/enemies";
import { spawnInterval, waveQueue } from "../data/waves";
import { nextInt, rangeFloat, shuffle } from "../rng";
import type { EnemyKind, GameEvent, Vec, World } from "../types";
import { freeSpot } from "./combat";
import { spawnPickup } from "./pickups";

function spawnEnemy(w: World, kind: EnemyKind, at: Vec): void {
  const def = ENEMIES[kind];
  const hp = def.hp * (1 + BALANCE.hpScalePerWave * (w.wave - 1));
  const speed = def.speed * (1 + Math.min(BALANCE.speedScaleCap, w.wave * BALANCE.speedScalePerWave));
  w.enemies.push({
    id: w.nextId++,
    kind,
    x: at.x,
    y: at.y,
    radius: def.radius,
    hp,
    maxHp: hp,
    speed,
    contactDamage: def.contactDamage,
    points: def.points,
    rise: BALANCE.riseTime,
    attackCd: 0,
    fireCd: rangeFloat(w.rng, 2.2, 3.2),
    hop: 0,
    kx: 0,
    ky: 0,
  });
  w.spawnedTotal += 1;
}

function reviveDowned(w: World, ev: GameEvent[]): void {
  const c = { x: (w.map.cols * w.map.tileSize) / 2, y: (w.map.rows * w.map.tileSize) / 2 };
  w.players.forEach((p, i) => {
    if (p.alive || p.away) return;
    const start = w.map.playerStarts[i % w.map.playerStarts.length] ?? c;
    p.alive = true;
    p.hp = BALANCE.reviveHp;
    p.x = start.x;
    p.y = start.y;
    p.cooldown = 0;
    ev.push({ type: "playerRevived", id: p.id });
  });
}

function startWave(w: World, wave: number, ev: GameEvent[]): void {
  w.wave = wave;
  w.phase = "wave";
  w.queue = shuffle(w.rng, waveQueue(wave));
  w.spawnTimer = 0;
  reviveDowned(w, ev);
  if (wave >= 2) {
    const spot = freeSpot(w);
    if (spot) spawnPickup(w, "crate", spot.x, spot.y);
  }
  w.flow.dirty = true;
  ev.push({ type: "waveStarted", wave });
}

export function updateWaves(w: World, dt: number, ev: GameEvent[]): void {
  if (w.phase === "break") {
    w.breakTimer -= dt;
    if (w.breakTimer <= 0) startWave(w, w.wave + 1, ev);
    return;
  }

  if (w.queue.length > 0) {
    w.spawnTimer -= dt;
    if (w.spawnTimer <= 0) {
      const alive = w.players.filter((p) => p.alive);
      const valid = w.map.spawns.filter((s) =>
        alive.every((p) => Math.hypot(p.x - s.x, p.y - s.y) >= BALANCE.minSpawnDistance),
      );
      if (valid.length > 0) {
        const at = valid[nextInt(w.rng, valid.length)]!;
        spawnEnemy(w, w.queue.pop()!, at);
        w.spawnTimer = spawnInterval(w.wave);
      }
    }
  }

  if (w.queue.length === 0 && w.enemies.length === 0) {
    w.phase = "break";
    w.breakTimer = BALANCE.waveBreak;
    ev.push({ type: "waveCleared", wave: w.wave });
  }
}
