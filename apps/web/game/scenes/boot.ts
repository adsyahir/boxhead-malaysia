import * as Phaser from "phaser";
import { generatePlaceholderTextures } from "../render/textures";
import { MAPS } from "../maps";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, "Memuatkan...", { fontFamily: "monospace", fontSize: "20px", color: "#ffffff" }).setOrigin(0.5);
    this.load.on("progress", (v: number) => label.setText(`Memuatkan ${Math.round(v * 100)}%`));
    this.load.spritesheet("tiles", "/maps/tiles.png", { frameWidth: 32, frameHeight: 32 });
    for (const m of MAPS) this.load.json(m.key, `/maps/${m.key}.json`);
  }

  create(): void {
    generatePlaceholderTextures(this);
    this.scene.start("Menu");
  }
}
