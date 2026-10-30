import type { PlayerInput } from "@kampung/game-core";

/** Framework-free keyboard state shared by the Phaser and Three.js clients. */
export interface Scheme {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  fire: string[];
  swap: string[];
}

export const ONE_PLAYER: Scheme = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  fire: ["KeyF", "Space", "KeyJ", "Enter", "NumpadEnter"],
  swap: ["KeyG", "KeyQ", "KeyK", "ShiftRight"],
};

export const TWO_PLAYER: [Scheme, Scheme] = [
  { up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"], fire: ["KeyF"], swap: ["KeyG"] },
  { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"], fire: ["Enter", "NumpadEnter"], swap: ["ShiftRight"] },
];

/** Number keys 1 to 9 then 0 select weapons directly (index 0..9 into WEAPON_IDS). */
const DIGIT_CODES: string[][] = [
  ["Digit1", "Numpad1"], ["Digit2", "Numpad2"], ["Digit3", "Numpad3"], ["Digit4", "Numpad4"], ["Digit5", "Numpad5"],
  ["Digit6", "Numpad6"], ["Digit7", "Numpad7"], ["Digit8", "Numpad8"], ["Digit9", "Numpad9"], ["Digit0", "Numpad0"],
];

/** Keys whose browser default (scrolling) must be suppressed while playing. */
export const CAPTURED = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];

export interface SampledInput {
  inputs: PlayerInput[];
  /** Whether a swap key went down since the last sample, even if already released. */
  swapTapped: boolean[];
}

/** Turns raw key codes into PlayerInput. Core never learns which device was used. */
export class KeyState {
  private readonly down = new Set<string>();
  /** Keys pressed since the last sample, so a tap shorter than a frame still counts. */
  private readonly tapped = new Set<string>();
  private readonly schemes: Scheme[];

  constructor(players: 1 | 2) {
    this.schemes = players === 1 ? [ONE_PLAYER] : [...TWO_PLAYER];
  }

  /** Returns true when the browser default should be prevented. */
  keydown(code: string): boolean {
    if (!this.down.has(code)) this.tapped.add(code);
    this.down.add(code);
    return CAPTURED.includes(code);
  }

  keyup(code: string): void {
    this.down.delete(code);
  }

  clear(): void {
    this.down.clear();
    this.tapped.clear();
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  sample(): SampledInput {
    const swapTapped: boolean[] = [];
    // Digits belong to the first player (solo, or player 1): two players cannot share the number row.
    const pick = DIGIT_CODES.findIndex((codes) => codes.some((c) => this.tapped.has(c)));
    const inputs = this.schemes.map((s, i): PlayerInput => {
      swapTapped.push(s.swap.some((c) => this.tapped.has(c)));
      return {
        moveX: (this.any(s.right) ? 1 : 0) - (this.any(s.left) ? 1 : 0),
        moveY: (this.any(s.down) ? 1 : 0) - (this.any(s.up) ? 1 : 0),
        fire: this.any(s.fire),
        switchWeapon: this.any(s.swap),
        ...(i === 0 && pick >= 0 ? { select: pick } : {}),
      };
    });
    this.tapped.clear();
    return { inputs, swapTapped };
  }
}
