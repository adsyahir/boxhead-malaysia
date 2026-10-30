import { describe, expect, it } from "vitest";
import { BALANCE, spawnInterval, step, waveComposition, waveQueue } from "../src";
import { IDLE, addEnemy, makeWorld, quietWave, run, seconds } from "./helpers";

describe("movement and collision", () => {
  it("moves at player speed and snaps facing to 8 directions", () => {
    const w = makeWorld();
    const x0 = w.players[0]!.x;
    run(w, 60, [{ ...IDLE, moveX: 1, moveY: 0 }]);
    expect(w.players[0]!.x - x0).toBeCloseTo(BALANCE.playerSpeed, 0);
    run(w, 1, [{ ...IDLE, moveX: 1, moveY: 1 }]);
    expect(w.players[0]!.facing.x).toBeCloseTo(Math.SQRT1_2);
    expect(w.players[0]!.facing.y).toBeCloseTo(Math.SQRT1_2);
  });

  it("does not move faster diagonally", () => {
    const w = makeWorld();
    const { x, y } = w.players[0]!;
    run(w, 60, [{ ...IDLE, moveX: 1, moveY: 1 }]);
    const d = Math.hypot(w.players[0]!.x - x, w.players[0]!.y - y);
    expect(d).toBeCloseTo(BALANCE.playerSpeed, 0);
  });

  it("is stopped by the border wall", () => {
    const w = makeWorld();
    run(w, 600, [{ ...IDLE, moveX: -1 }]);
    const p = w.players[0]!;
    expect(p.x).toBeGreaterThanOrEqual(w.map.tileSize + p.radius - 0.01);
  });
});

describe("Lastik", () => {
  it("fires on cooldown and damages for 26", () => {
    const w = makeWorld();
    quietWave(w);
    const p = w.players[0]!;
    const e = addEnemy(w, p.x + 100, p.y, "pocong", { hp: 1000, maxHp: 1000 });
    const shots = run(w, seconds(0.95), [{ ...IDLE, fire: true }]).filter((x) => x.type === "shotFired");
    expect(shots.length).toBe(4); // t=0, 0.3, 0.6, 0.9
    run(w, seconds(0.2), [IDLE]);
    expect(e.hp).toBe(1000 - 26 * 4);
  });

  it("does not hit a rising enemy", () => {
    const w = makeWorld();
    quietWave(w);
    const p = w.players[0]!;
    const e = addEnemy(w, p.x + 50, p.y, "pocong", { rise: 1 });
    run(w, 10, [{ ...IDLE, fire: true }]);
    expect(e.hp).toBe(55);
  });
});

describe("waves", () => {
  it("matches the composition formulas", () => {
    expect(waveComposition(1)).toEqual({ pocong: 8, toyol: 0, pontianak: 0 });
    expect(waveComposition(2)).toEqual({ pocong: 11, toyol: 3, pontianak: 0 });
    expect(waveComposition(3)).toEqual({ pocong: 14, toyol: 5, pontianak: 1 });
    expect(waveComposition(7)).toEqual({ pocong: 26, toyol: 13, pontianak: 3 });
    expect(waveQueue(3)).toHaveLength(20);
    expect(spawnInterval(1)).toBeCloseTo(1.03);
    expect(spawnInterval(20)).toBe(0.22);
  });

  it("starts wave 1 after the initial delay and spawns away from players", () => {
    const w = makeWorld();
    const events = run(w, seconds(5));
    expect(events.some((e) => e.type === "waveStarted" && e.wave === 1)).toBe(true);
    expect(w.enemies.length).toBeGreaterThan(0);
    for (const e of w.enemies) {
      expect(Math.hypot(e.x - w.players[0]!.x, e.y - w.players[0]!.y)).toBeGreaterThanOrEqual(BALANCE.minSpawnDistance - 1);
    }
  });

  it("scales hp and speed with wave", () => {
    const w = makeWorld();
    w.wave = 0;
    w.phase = "break";
    w.breakTimer = 0;
    run(w, 2);
    const w1 = w.enemies[0];
    expect(w1).toBeDefined();
    expect(w1!.maxHp).toBeCloseTo(55);
  });

  it("clears into a 3s break then starts the next wave", () => {
    const w = makeWorld();
    w.phase = "wave";
    w.wave = 1;
    w.queue = [];
    const ev = run(w, 1);
    expect(ev.some((e) => e.type === "waveCleared")).toBe(true);
    expect(w.phase).toBe("break");
    expect(w.breakTimer).toBeCloseTo(BALANCE.waveBreak, 1);
    const ev2 = run(w, seconds(3.1));
    expect(ev2.some((e) => e.type === "waveStarted" && e.wave === 2)).toBe(true);
    expect(w.pickups.some((p) => p.kind === "crate")).toBe(true);
  });
});

describe("scoring and combo", () => {
  function kill(w: ReturnType<typeof makeWorld>) {
    const p = w.players[0]!;
    const e = addEnemy(w, p.x + 30, p.y, "pocong", { hp: 1, maxHp: 1 });
    run(w, 1, [{ ...IDLE, fire: true }]);
    w.players[0]!.cooldown = 0;
    return e;
  }

  it("kills within 2.2s raise the combo and multiply points", () => {
    const w = makeWorld();
    quietWave(w);
    kill(w);
    run(w, 5);
    expect(w.score).toBe(100);
    kill(w);
    run(w, 5);
    expect(w.combo).toBe(2);
    expect(w.score).toBe(100 + 200);
  });

  it("resets combo after the window", () => {
    const w = makeWorld();
    quietWave(w);
    kill(w);
    run(w, seconds(2.5));
    expect(w.combo).toBe(1);
    kill(w);
    run(w, 5);
    expect(w.score).toBe(200);
  });

  it("caps combo at 30", () => {
    const w = makeWorld();
    quietWave(w);
    for (let i = 0; i < 40; i++) {
      kill(w);
      run(w, 3);
    }
    expect(w.combo).toBe(30);
  });
});

describe("downed, revive, game over", () => {
  it("game over when all players are downed", () => {
    const w = makeWorld();
    quietWave(w);
    const p = w.players[0]!;
    addEnemy(w, p.x, p.y, "pocong", { contactDamage: 200 });
    const ev = run(w, 3);
    expect(w.over).toBe(true);
    expect(ev.some((e) => e.type === "gameOver")).toBe(true);
    expect(step(w, [IDLE])).toEqual([]);
  });

  it("downed player revives with 60 hp at next wave while partner lives", () => {
    const w = makeWorld({ players: 2 });
    quietWave(w);
    w.players[1]!.alive = false;
    w.players[1]!.hp = 0;
    w.enemies = [];
    w.phase = "break";
    w.breakTimer = 0;
    run(w, 2);
    expect(w.players[1]!.alive).toBe(true);
    expect(w.players[1]!.hp).toBe(BALANCE.reviveHp);
  });
});

describe("determinism", () => {
  it("same seed and inputs give the same world", () => {
    const sim = (seed: number) => {
      const w = makeWorld({ seed, players: 2 });
      for (let i = 0; i < 1800; i++) {
        step(w, [
          { moveX: Math.sin(i / 50), moveY: Math.cos(i / 70), fire: i % 3 !== 0, switchWeapon: i % 200 === 0 },
          { moveX: -1, moveY: 0.3, fire: true, switchWeapon: false },
        ]);
      }
      return JSON.stringify({ ...w, map: null, flow: null });
    };
    expect(sim(7)).toBe(sim(7));
    expect(sim(7)).not.toBe(sim(8));
  });
});
