import { BALANCE } from "./data/balance";
import type { GameEvent, PlayerInput, World } from "./types";
import { step } from "./world";

export const MAX_STEPS_PER_FRAME = 5;

/**
 * One-shot inputs (a weapon-swap tap, a number-key pick) that arrived on a frame in which no simulation step ran.
 * A display faster than 60 Hz has such frames all the time; without this the tap would be thrown away.
 */
export interface TapCarry {
  select: (number | undefined)[];
  swap: boolean[];
}

export function newTapCarry(): TapCarry {
  return { select: [], swap: [] };
}

/**
 * Fixed 60 Hz accumulator for a renderer: advances the World by whole BALANCE.dt steps (at most
 * MAX_STEPS_PER_FRAME) and returns the leftover time plus every event produced. A tap is applied on the first
 * step that actually runs, however many frames that takes.
 */
export function advanceFrame(
  world: World,
  inputs: PlayerInput[],
  swapTapped: boolean[],
  acc: number,
  frameDt: number,
  carry: TapCarry,
): { acc: number; events: GameEvent[] } {
  inputs.forEach((inp, i) => {
    if (inp.select !== undefined) carry.select[i] = inp.select;
    if (swapTapped[i]) carry.swap[i] = true;
  });

  const events: GameEvent[] = [];
  let stepped = 0;
  acc += frameDt;
  while (acc >= BALANCE.dt && stepped < MAX_STEPS_PER_FRAME) {
    const tick = inputs.map((inp, i): PlayerInput => {
      const first = stepped === 0;
      const select = first ? carry.select[i] : undefined;
      return {
        moveX: inp.moveX,
        moveY: inp.moveY,
        ...(inp.aimX !== undefined ? { aimX: inp.aimX, aimY: inp.aimY ?? 0 } : {}),
        fire: inp.fire,
        switchWeapon: inp.switchWeapon || (first && carry.swap[i] === true),
        ...(select !== undefined ? { select } : {}),
      };
    });
    events.push(...step(world, tick, BALANCE.dt));
    if (stepped === 0) {
      carry.select.length = 0;
      carry.swap.length = 0;
    }
    acc -= BALANCE.dt;
    stepped++;
  }
  if (stepped === MAX_STEPS_PER_FRAME) acc = 0; // drop the backlog instead of spiralling
  return { acc, events };
}
