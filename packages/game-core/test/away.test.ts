import { describe, expect, it } from "vitest";
import { BALANCE, setPlayerAway, step } from "../src";
import { IDLE, addEnemy, makeWorld, quietWave, run } from "./helpers";

describe("away players (online disconnects)", () => {
  it("a leaver is downed and is not revived at the next wave", () => {
    const w = makeWorld({ players: 2 });
    quietWave(w);
    setPlayerAway(w, 1, true);
    expect(w.players[1]).toMatchObject({ alive: false, hp: 0, away: true });
    w.enemies = [];
    w.phase = "break";
    w.breakTimer = 0;
    run(w, 2, [IDLE, IDLE]);
    expect(w.players[1]!.alive).toBe(false);
    expect(w.players[0]!.alive).toBe(true);
  });

  it("a returning player comes back at the following wave with revive hp", () => {
    const w = makeWorld({ players: 2 });
    quietWave(w);
    setPlayerAway(w, 1, true);
    setPlayerAway(w, 1, false);
    expect(w.players[1]!.alive).toBe(false); // still down until the wave turns over
    w.enemies = [];
    w.phase = "break";
    w.breakTimer = 0;
    run(w, 2, [IDLE, IDLE]);
    expect(w.players[1]).toMatchObject({ alive: true, hp: BALANCE.reviveHp });
  });

  it("game over still triggers when the only remaining player is downed", () => {
    const w = makeWorld({ players: 2 });
    quietWave(w);
    setPlayerAway(w, 1, true);
    const p = w.players[0]!;
    addEnemy(w, p.x, p.y, "pocong", { contactDamage: 500 });
    const ev = run(w, 3, [IDLE, IDLE]);
    expect(w.over).toBe(true);
    expect(ev.some((e) => e.type === "gameOver")).toBe(true);
    expect(step(w, [IDLE, IDLE])).toEqual([]);
  });

  it("enemies ignore an away player", () => {
    const w = makeWorld({ players: 2 });
    quietWave(w);
    setPlayerAway(w, 1, true);
    w.players[1]!.x = w.players[0]!.x + 40;
    const e = addEnemy(w, w.players[1]!.x + 20, w.players[1]!.y, "pocong", { speed: 62 });
    run(w, 30, [IDLE, IDLE]);
    expect(w.players[1]!.hp).toBe(0);
    expect(e.hp).toBeGreaterThan(0);
  });
});
