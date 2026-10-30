import { KeyState, type SampledInput } from "../../game/input/key-state";

/** Framework-free keyboard input on window events, sharing the key schemes with the Phaser client. */
export class WindowKeyboard {
  private readonly state: KeyState;
  private readonly onDown = (ev: KeyboardEvent) => {
    if (ev.repeat && this.isCaptured(ev.code)) {
      ev.preventDefault();
      return;
    }
    if (this.state.keydown(ev.code)) ev.preventDefault();
  };
  private readonly onUp = (ev: KeyboardEvent) => this.state.keyup(ev.code);
  private readonly onBlur = () => this.state.clear();

  constructor(players: 1 | 2) {
    this.state = new KeyState(players);
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  private isCaptured(code: string): boolean {
    return code.startsWith("Arrow") || code === "Space";
  }

  sample(): SampledInput {
    return this.state.sample();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    this.state.clear();
  }
}
