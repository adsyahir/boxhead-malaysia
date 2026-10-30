import { describe, expect, it } from "vitest";
import { BALANCE, advanceFrame, newTapCarry, type PlayerInput } from "../src";
import { IDLE, makeWorld, quietWave } from "./helpers";

const dt = BALANCE.dt;

function armed() {
  const w = makeWorld();
  quietWave(w);
  w.level = 5;
  w.unlocked.push("uzi");
  w.players[0]!.ammo.uzi = 60;
  return w;
}

describe("advanceFrame (fixed 60 Hz accumulator)", () => {
  it("runs whole steps and keeps the remainder", () => {
    const w = makeWorld();
    const carry = newTapCarry();
    const a = advanceFrame(w, [IDLE], [false], 0, dt * 2.5, carry);
    expect(w.tick).toBe(2);
    expect(a.acc).toBeCloseTo(dt * 0.5);
  });

  it("a number-key pick on a frame with no step is not lost", () => {
    const w = armed();
    const carry = newTapCarry();
    const pick: PlayerInput = { ...IDLE, select: 1 };
    // frame 1: only 5 ms elapsed, so no simulation step runs
    let r = advanceFrame(w, [pick], [false], 0, 0.005, carry);
    expect(w.tick).toBe(0);
    expect(w.players[0]!.weapon).toBe("lastik");
    // frame 2: no key now, enough time for a step: the pick is applied then
    r = advanceFrame(w, [IDLE], [false], r.acc, 0.02, carry);
    expect(w.tick).toBeGreaterThan(0);
    expect(w.players[0]!.weapon).toBe("uzi");
  });

  it("a weapon-swap tap on a frame with no step is not lost either", () => {
    const w = armed();
    const carry = newTapCarry();
    let r = advanceFrame(w, [IDLE], [true], 0, 0.005, carry);
    expect(w.players[0]!.weapon).toBe("lastik");
    r = advanceFrame(w, [IDLE], [false], r.acc, 0.02, carry);
    expect(w.players[0]!.weapon).toBe("uzi"); // next usable weapon after Lastik
    void r;
  });

  it("a tap is applied once, not on every later frame", () => {
    const w = armed();
    w.players[0]!.ammo.lastik = Infinity;
    const carry = newTapCarry();
    const pick: PlayerInput = { ...IDLE, select: 1 };
    let r = advanceFrame(w, [pick], [false], 0, dt * 1.1, carry);
    expect(w.players[0]!.weapon).toBe("uzi");
    w.players[0]!.weapon = "lastik"; // player switched back by other means
    r = advanceFrame(w, [IDLE], [false], r.acc, dt * 3, carry);
    expect(w.players[0]!.weapon).toBe("lastik");
  });

  it("drops the backlog after a long stall instead of spiralling", () => {
    const w = makeWorld();
    const carry = newTapCarry();
    const r = advanceFrame(w, [IDLE], [false], 0, 3, carry);
    expect(w.tick).toBe(5);
    expect(r.acc).toBe(0);
  });
});
