import type Phaser from "phaser";
import { KeyState, type SampledInput } from "./key-state";

/** Phaser adapter around the shared KeyState. */
export class KeyboardInput {
  private readonly state: KeyState;
  private readonly onBlur = () => this.state.clear();

  constructor(private readonly scene: Phaser.Scene, players: 1 | 2) {
    this.state = new KeyState(players);
    const kb = scene.input.keyboard;
    if (!kb) return;
    kb.on("keydown", (ev: KeyboardEvent) => {
      if (this.state.keydown(ev.code)) ev.preventDefault();
    });
    kb.on("keyup", (ev: KeyboardEvent) => this.state.keyup(ev.code));
    window.addEventListener("blur", this.onBlur);
  }

  destroy(): void {
    window.removeEventListener("blur", this.onBlur);
    this.scene.input.keyboard?.removeAllListeners();
  }

  sample(): SampledInput {
    return this.state.sample();
  }
}
