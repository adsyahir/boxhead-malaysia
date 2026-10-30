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
    const inputs = this.schemes.map((s) => {
      swapTapped.push(s.swap.some((c) => this.tapped.has(c)));
      return {
        moveX: (this.any(s.right) ? 1 : 0) - (this.any(s.left) ? 1 : 0),
        moveY: (this.any(s.down) ? 1 : 0) - (this.any(s.up) ? 1 : 0),
        fire: this.any(s.fire),
        switchWeapon: this.any(s.swap),
      };
    });
    this.tapped.clear();
    return { inputs, swapTapped };
  }
}
