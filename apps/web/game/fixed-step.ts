import { advanceFrame, newTapCarry, type GameEvent, type TapCarry, type World } from "@kampung/game-core";
import type { SampledInput } from "./input/key-state";

export { newTapCarry, type TapCarry };

/** Run seed for createWorld. Randomness lives here in the client; core stays deterministic. */
export function newRunSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Fixed 60 Hz accumulator shared by both renderers (the logic itself lives in game-core and is tested there). */
export function advance(world: World, sampled: SampledInput, acc: number, frameDt: number, carry: TapCarry): { acc: number; events: GameEvent[] } {
  return advanceFrame(world, sampled.inputs, sampled.swapTapped, acc, frameDt, carry);
}
