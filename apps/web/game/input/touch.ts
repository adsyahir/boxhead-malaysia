import type Phaser from "phaser";
import { STICK_RADIUS, applyStick, resetTouchState, touchState } from "./touch-state";

export { isTouchDevice, sampleTouch, touchState } from "./touch-state";

/** Virtual joystick (bottom-left) plus Tembak and Tukar buttons (bottom-right). Lives in the Hud scene. */
export class TouchControls {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[];
  private stickId = -1;
  private stickOrigin = { x: 0, y: 0 };
  private stickPos = { x: 0, y: 0 };
  private fireId = -1;
  private swapId = -1;

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.addPointer(2);
    this.gfx = scene.add.graphics().setDepth(50);
    this.labels = [
      scene.add.text(0, 0, "Tembak", { fontSize: "16px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5).setDepth(51),
      scene.add.text(0, 0, "Tukar", { fontSize: "14px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5).setDepth(51),
    ];
    scene.input.on("pointerdown", this.down, this);
    scene.input.on("pointermove", this.move, this);
    scene.input.on("pointerup", this.up, this);
    scene.input.on("pointerupoutside", this.up, this);
    scene.events.once("shutdown", () => this.destroy());
    this.reset();
  }

  private get fireBtn() {
    return { x: this.scene.scale.width - 90, y: this.scene.scale.height - 100, r: 56 };
  }
  private get swapBtn() {
    return { x: this.scene.scale.width - 200, y: this.scene.scale.height - 60, r: 40 };
  }
  private inside(p: Phaser.Input.Pointer, b: { x: number; y: number; r: number }) {
    return Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 12;
  }

  private down(p: Phaser.Input.Pointer): void {
    if (this.inside(p, this.fireBtn) && this.fireId < 0) {
      this.fireId = p.id;
      touchState.fire = true;
    } else if (this.inside(p, this.swapBtn) && this.swapId < 0) {
      this.swapId = p.id;
      touchState.swapHeld = true;
      touchState.swapTapped = true;
    } else if (p.x < this.scene.scale.width * 0.5 && this.stickId < 0) {
      this.stickId = p.id;
      this.stickOrigin = { x: p.x, y: p.y };
      this.stickPos = { x: p.x, y: p.y };
    }
  }

  private move(p: Phaser.Input.Pointer): void {
    if (p.id !== this.stickId) return;
    const d = applyStick(p.x - this.stickOrigin.x, p.y - this.stickOrigin.y);
    this.stickPos = { x: this.stickOrigin.x + d.dx, y: this.stickOrigin.y + d.dy };
  }

  private up(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickId) {
      this.stickId = -1;
      touchState.moveX = 0;
      touchState.moveY = 0;
    }
    if (p.id === this.fireId) {
      this.fireId = -1;
      touchState.fire = false;
    }
    if (p.id === this.swapId) {
      this.swapId = -1;
      touchState.swapHeld = false;
    }
  }

  private reset(): void {
    resetTouchState();
  }

  draw(): void {
    const g = this.gfx;
    g.clear();
    const base = this.stickId >= 0 ? this.stickOrigin : { x: 110, y: this.scene.scale.height - 110 };
    const knob = this.stickId >= 0 ? this.stickPos : base;
    g.lineStyle(3, 0xffffff, 0.35).strokeCircle(base.x, base.y, STICK_RADIUS);
    g.fillStyle(0xffffff, 0.12).fillCircle(base.x, base.y, STICK_RADIUS);
    g.fillStyle(0xffffff, 0.4).fillCircle(knob.x, knob.y, 24);

    const f = this.fireBtn;
    const s = this.swapBtn;
    g.fillStyle(0xd03030, this.fireId >= 0 ? 0.7 : 0.4).fillCircle(f.x, f.y, f.r);
    g.fillStyle(0x3070d0, this.swapId >= 0 ? 0.7 : 0.4).fillCircle(s.x, s.y, s.r);
    this.labels[0]!.setPosition(f.x, f.y);
    this.labels[1]!.setPosition(s.x, s.y);
  }

  destroy(): void {
    this.scene.input.off("pointerdown", this.down, this);
    this.scene.input.off("pointermove", this.move, this);
    this.scene.input.off("pointerup", this.up, this);
    this.scene.input.off("pointerupoutside", this.up, this);
    this.reset();
  }
}
