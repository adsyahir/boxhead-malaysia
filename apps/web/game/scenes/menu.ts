import * as Phaser from "phaser";
import { audio } from "../audio/audio";
import { isTouchDevice } from "../input/touch";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    this.cameras.main.setBackgroundColor("#0a0d16");

    this.add.text(cx, height * 0.2, "ZOMBIE\nKAMPUNG PISANG", {
      fontFamily: "monospace", fontSize: `${Math.max(28, Math.min(54, width / 14))}px`, color: "#ffd24a", align: "center", fontStyle: "bold", stroke: "#3a1a00", strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(cx, height * 0.36, "Pocong, toyol dan pontianak mengamuk di kampung!", {
      fontFamily: "monospace", fontSize: "14px", color: "#9fb4d0",
    }).setOrigin(0.5);

    const touch = isTouchDevice();
    const items: { label: string; run: () => void }[] = [{ label: "1 Pemain", run: () => this.start(1) }];
    if (!touch) items.push({ label: "2 Pemain (satu papan kekunci)", run: () => this.start(2) });
    items.push({ label: "Papan Markah", run: () => { window.location.href = "/leaderboard"; } });

    items.forEach((it, i) => {
      const t = this.add.text(cx, height * 0.5 + i * 52, it.label, {
        fontFamily: "monospace", fontSize: "24px", color: "#ffffff", backgroundColor: "#243251", padding: { x: 20, y: 10 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on("pointerover", () => t.setBackgroundColor("#3a5088"));
      t.on("pointerout", () => t.setBackgroundColor("#243251"));
      t.on("pointerdown", () => { audio.unlock(); it.run(); });
    });

    const help = touch
      ? "Kayu bedik kiri untuk bergerak. Tembak dan Tukar di kanan."
      : "1P: WASD/anak panah, F/Space tembak, G/Q tukar senjata.\n2P: Abu WASD+F+G, Siti anak panah+Enter+Shift kanan.  P jeda, M senyap.";
    this.add.text(cx, height - 52, help, { fontFamily: "monospace", fontSize: "12px", color: "#6c7d99", align: "center" }).setOrigin(0.5);

    const kb = this.input.keyboard;
    kb?.on("keydown-ONE", () => { audio.unlock(); this.start(1); });
    if (!touch) kb?.on("keydown-TWO", () => { audio.unlock(); this.start(2); });
    kb?.on("keydown-M", () => audio.toggleMute());
  }

  private start(players: 1 | 2): void {
    this.scene.start("MapSelect", { players });
  }
}
