import { BALANCE, step, type GameEvent, type World } from "@kampung/game-core";
import type { SampledInput } from "./input/key-state";

const MAX_STEPS_PER_FRAME = 5;

/** Run seed for createWorld. Randomness lives here in the client; core stays deterministic. */
export function newRunSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/**
 * Fixed 60 Hz accumulator shared by both renderers. Advances the World by whole BALANCE.dt steps
 * (at most MAX_STEPS_PER_FRAME) and returns the leftover time plus every event produced.
 * A swap tap shorter than a frame is applied on the first step only.
 */
export function advance(world: World, sampled: SampledInput, acc: number, frameDt: number): { acc: number; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let stepped = 0;
  acc += frameDt;
  while (acc >= BALANCE.dt && stepped < MAX_STEPS_PER_FRAME) {
    const inputs = sampled.inputs.map((inp, i) => ({
      ...inp,
      switchWeapon: inp.switchWeapon || (stepped === 0 && sampled.swapTapped[i] === true),
    }));
    events.push(...step(world, inputs, BALANCE.dt));
    acc -= BALANCE.dt;
    stepped++;
  }
  if (stepped === MAX_STEPS_PER_FRAME) acc = 0; // drop the backlog instead of spiralling
  return { acc, events };
}
