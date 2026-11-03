import { describe, expect, it } from "vitest";
import { BALANCE, WEAPON_IDS, createBoxMap, createWorld, step, validateRun, type GameEvent, type PlayerInput, type World } from "../src";

/** A bot that turns to the nearest ghost, fires, picks the best weapon it has, and circles slowly. */
function botInput(w: World, t: number): PlayerInput {
  const p = w.players[0]!;
  let best: { x: number; y: number; d: number } | null = null;
  for (const e of w.enemies) {
    if (e.hp <= 0 || e.rise > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (!best || d < best.d) best = { x: e.x - p.x, y: e.y - p.y, d };
  }
  const best0 = [...w.unlocked].reverse().find((id) => id !== "pagarBuluh" && id !== "chargepack" && id !== "tongGas");
  return {
    moveX: Math.cos(t / 90) * 0.6,
    moveY: Math.sin(t / 90) * 0.6,
    ...(best ? { aimX: best.x / best.d, aimY: best.y / best.d } : {}),
    fire: best !== null,
    switchWeapon: false,
    ...(t % 120 === 0 && best0 ? { select: WEAPON_IDS.indexOf(best0) } : {}),
  };
}

const summary = (w: World) => ({ score: w.score, wave: Math.max(1, w.wave), kills: w.kills, durationMs: Math.round(w.time * 1000) });

describe("validateRun accepts real games", () => {
  it.each([1, 7, 42, 1234])("seed %i: every point of a bot's run passes, including the end", (seed) => {
    const w = createWorld({ seed, map: createBoxMap(60, 40), playerCount: 1 });
    let over: Extract<GameEvent, { type: "gameOver" }> | null = null;
    let checked = 0;
    const ticks = BALANCE.tickRate * 60 * 12; // up to 12 minutes of play
    for (let t = 0; t < ticks && !over; t++) {
      for (const e of step(w, [botInput(w, t)])) if (e.type === "gameOver") over = e;
      if (t % 600 === 0 && w.score > 0) {
        expect(validateRun(summary(w)), `t=${t} ${JSON.stringify(summary(w))}`).toEqual({ ok: true });
        checked++;
      }
    }
    const end = over ? { score: over.score, wave: Math.max(1, over.wave), kills: over.kills, durationMs: over.durationMs } : summary(w);
    expect(validateRun(end), JSON.stringify(end)).toEqual({ ok: true });
    expect(checked).toBeGreaterThan(3);
    expect(w.kills).toBeGreaterThan(20);
  });
});

describe("validateRun rejects edited numbers", () => {
  // A real-looking finished run: wave 3 reached, so waves 1 and 2 were cleared.
  const w = createWorld({ seed: 7, map: createBoxMap(60, 40), playerCount: 1 });
  for (let t = 0; t < BALANCE.tickRate * 150 && w.wave < 4; t++) step(w, [botInput(w, t)]);
  const real = summary(w);

  it("the untouched run passes", () => {
    expect(validateRun(real)).toEqual({ ok: true });
  });

  it.each([
    ["score multiplied by 10", { score: real.score * 10 }],
    ["score with an impossible last digit", { score: real.score + 7 }],
    ["huge score with the same kills", { score: real.score + 1_000_000 }],
    ["much higher wave", { wave: real.wave + 20, durationMs: real.durationMs * 10 }],
    ["kills cut to look less suspicious", { kills: Math.floor(real.kills / 4) }],
    ["more kills than ghosts spawned", { kills: real.kills + 500 }],
    ["run made to look shorter", { durationMs: 1000 }],
  ])("%s fails", (_label, patch) => {
    expect(validateRun({ ...real, ...patch }).ok).toBe(false);
  });
});
