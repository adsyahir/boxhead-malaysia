import { describe, expect, it } from "vitest";
import { BALANCE, createBoxMap, movePlayer, type Walker } from "@kampung/game-core";
import { PREDICT, Predictor } from "./predictor";

const map = createBoxMap(60, 40);
const FACE = { x: 1, y: 0 };
const FRAME = 1000 / 60;

function make(x = 600, y = 400): { p: Predictor; now: () => number; advance: (mx: number, my: number, ms: number) => void } {
  const p = new Predictor(map);
  let t = 1000;
  p.reset(x, y, FACE, t);
  return {
    p,
    now: () => t,
    advance: (mx, my, ms) => {
      const end = t + ms;
      while (t < end) {
        t += FRAME;
        p.step(mx, my, t);
      }
    },
  };
}

describe("Predictor: local movement", () => {
  it("walks at player speed", () => {
    const { p, advance } = make();
    advance(1, 0, 1000);
    expect(p.body.x - 600).toBeCloseTo(BALANCE.playerSpeed, -1); // within 5 px: whole 60 Hz steps over 1 s
  });

  it("starts moving at the very next frame: that is the point", () => {
    const { p, advance } = make();
    advance(1, 0, 25);
    expect(p.body.x - 600).toBeGreaterThan(2);
  });

  it("stops at a wall instead of walking through it", () => {
    const { p, advance } = make(map.tileSize + BALANCE.playerRadius + 5, 400);
    advance(-1, 0, 2000);
    expect(p.body.x).toBeGreaterThanOrEqual(map.tileSize + BALANCE.playerRadius - 0.01);
  });

  it("does nothing while inactive", () => {
    const p = new Predictor(map);
    p.step(1, 0, 100);
    expect(p.body.x).toBe(0);
  });
});

/** A tiny model of the network: 50 ms up, 50 ms down, inputs at 30 Hz, snapshots at 20 Hz, a 60 Hz server. */
function simulate(seconds: number, schedule: (ms: number) => [number, number], opts: { upMs?: number; downMs?: number } = {}) {
  const up = opts.upMs ?? 50;
  const down = opts.downMs ?? 50;
  const p = new Predictor(map);
  const server: Walker = { x: 600, y: 400, radius: BALANCE.playerRadius, facing: { ...FACE } };
  p.reset(600, 400, FACE, 0);

  const toServer: { at: number; seq: number; mx: number; my: number }[] = [];
  const toClient: { at: number; x: number; y: number; ack: number }[] = [];
  let seq = 0;
  let serverStick: [number, number] = [0, 0];
  let ack = 0;
  let nextInput = 0;
  let nextTick = 0;
  let tick = 0;
  const errors: number[] = [];
  let maxJump = 0;

  for (let t = 0; t <= seconds * 1000; t += 1) {
    // client frame every ~16.7 ms
    if (t % 17 === 0) {
      const [mx, my] = schedule(t);
      const before = { x: p.body.x, y: p.body.y };
      p.step(mx, my, t);
      const moved = Math.hypot(p.body.x - before.x, p.body.y - before.y);
      void moved;
      if (t >= nextInput) {
        seq++;
        p.recordSent(seq, t);
        toServer.push({ at: t + up, seq, mx, my });
        nextInput = t + 33;
      }
      for (let i = toClient.length - 1; i >= 0; i--) {
        const m = toClient[i]!;
        if (m.at <= t) {
          const bx = p.body.x;
          const by = p.body.y;
          p.reconcile({ x: m.x, y: m.y, alive: true, ack: m.ack }, FACE, t);
          maxJump = Math.max(maxJump, Math.hypot(p.body.x - bx, p.body.y - by));
          if (t > 600) errors.push(p.stats.lastError);
          toClient.splice(i, 1);
        }
      }
    }
    // server tick every ~16.7 ms
    if (t >= nextTick) {
      nextTick += 1000 / 60;
      for (let i = 0; i < toServer.length; ) {
        const m = toServer[i]!;
        if (m.at <= t) {
          serverStick = [m.mx, m.my];
          ack = Math.max(ack, m.seq);
          toServer.splice(i, 1);
        } else i++;
      }
      movePlayer(map, server, serverStick[0], serverStick[1], BALANCE.dt);
      tick++;
      if (tick % 3 === 0) toClient.push({ at: t + down, x: server.x, y: server.y, ack });
    }
  }
  return { p, server, errors, maxJump };
}

describe("Predictor: reconciling with a lagging server", () => {
  const dance = (ms: number): [number, number] => {
    const phase = Math.floor(ms / 700) % 4;
    return phase === 0 ? [1, 0] : phase === 1 ? [0, 1] : phase === 2 ? [-1, -0.5] : [0, 0];
  };

  it("stays within a few pixels of the server's own idea of the trajectory, and corrections are gentle", () => {
    const { errors, maxJump } = simulate(6, dance);
    expect(errors.length).toBeGreaterThan(50);
    const worst = Math.max(...errors);
    expect(worst).toBeLessThan(14); // the model is crude (17 ms frames, 30 Hz inputs): a few px of timing slack
    expect(maxJump).toBeLessThan(5); // no visible pops
  });

  it("works the same with a slow connection (150 ms each way)", () => {
    const { errors, maxJump } = simulate(6, dance, { upMs: 150, downMs: 150 });
    expect(Math.max(...errors)).toBeLessThan(16);
    expect(maxJump).toBeLessThan(5);
  });

  it("ends up where the server is once the hero stops", () => {
    const { p, server } = simulate(5, (ms) => (ms < 2000 ? [1, 0.3] : [0, 0]));
    expect(Math.hypot(p.body.x - server.x, p.body.y - server.y)).toBeLessThan(3);
  });
});

describe("Predictor: disagreements with the server", () => {
  function withHistory() {
    const m = make();
    m.advance(1, 0, 500);
    m.p.recordSent(1, m.now());
    m.advance(1, 0, 40);
    return m;
  }

  it("snaps at once to a teleport (revive, respawn)", () => {
    const m = withHistory();
    const before = { ...m.p.body };
    m.p.reconcile({ x: before.x + 500, y: before.y, alive: true, ack: 1 }, FACE, m.now());
    expect(m.p.stats.snaps).toBe(1);
    expect(Math.abs(m.p.body.x - (before.x + 500))).toBeLessThan(10);
  });

  it("blends a small difference in over several snapshots instead of jumping", () => {
    const m = withHistory();
    const target = m.p.body.x - 30; // the server says we are 30 px behind (a wall we did not know about)
    const gaps: number[] = [];
    for (let i = 0; i < 25; i++) {
      m.advance(0, 0, 50);
      m.p.recordSent(2 + i, m.now());
      m.p.reconcile({ x: target, y: m.p.body.y, alive: true, ack: 2 + i }, FACE, m.now() + PREDICT.reconcileLagMs);
      gaps.push(Math.abs(m.p.body.x - target));
    }
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeLessThanOrEqual(gaps[i - 1]! + 1e-9); // never gets worse
    expect(gaps[0]!).toBeGreaterThan(15); // the first correction is partial
    expect(gaps[gaps.length - 1]!).toBeLessThan(1.5);
    expect(m.p.stats.snaps).toBe(0);
  });

  it("stops predicting while the hero is downed, and starts again from the server's position on revive", () => {
    const m = withHistory();
    expect(m.p.reconcile({ x: 100, y: 100, alive: false, ack: 1 }, FACE, m.now())).toBe(false);
    expect(m.p.active).toBe(false);
    expect(m.p.reconcile({ x: 700, y: 500, alive: true, ack: 0 }, FACE, m.now())).toBe(true);
    expect(m.p.active).toBe(true);
    expect(m.p.body).toMatchObject({ x: 700, y: 500 });
  });

  it("ignores a snapshot whose ack it never sent (nothing to compare)", () => {
    const m = withHistory();
    const before = { ...m.p.body };
    m.p.reconcile({ x: before.x + 20, y: before.y, alive: true, ack: 9999 }, FACE, m.now());
    m.p.reconcile({ x: before.x + 20, y: before.y, alive: true }, FACE, m.now());
    expect(m.p.body.x).toBe(before.x);
    expect(m.p.stats.reconciles).toBe(0);
  });
});
