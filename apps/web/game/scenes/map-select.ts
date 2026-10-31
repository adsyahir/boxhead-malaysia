import * as Phaser from "phaser";
import { t } from "../../i18n";
import type { Key } from "../../i18n";
import { MAPS } from "../maps";

const BLURB: Record<string, Key> = { "kampung-pisang": "mapKampungBlurb", "kebun-getah": "mapGetahBlurb", "tanah-perkuburan": "mapKuburBlurb" };

export class MapSelectScene extends Phaser.Scene {
  private players: 1 | 2 = 1;

  constructor() {
    super("MapSelect");
  }

  init(data: { players?: 1 | 2 }): void {
    this.players = data.players ?? 1;
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#0a0d16");
    this.add.text(width / 2, 48, t("chooseMap"), { fontFamily: "monospace", fontSize: "30px", color: "#ffd24a", fontStyle: "bold" }).setOrigin(0.5);

    const narrow = width < 700;
    const cardW = narrow ? Math.min(width - 40, 420) : Math.min(260, (width - 80) / 3);
    const cardH = narrow ? 90 : 220;
    MAPS.forEach((m, i) => {
      const x = narrow ? width / 2 : width / 2 + (i - 1) * (cardW + 20);
      const y = narrow ? 120 + i * (cardH + 14) + cardH / 2 : height / 2;
      const card = this.add.rectangle(x, y, cardW, cardH, 0x1c2640).setStrokeStyle(2, 0x41598f).setInteractive({ useHandCursor: true });
      this.add.text(x, y - (narrow ? 20 : 70), `${i + 1}. ${m.name}`, { fontFamily: "monospace", fontSize: "18px", color: "#ffffff", fontStyle: "bold", wordWrap: { width: cardW - 20 }, align: "center" }).setOrigin(0.5);
      this.add.text(x, y + (narrow ? 16 : 10), t(BLURB[m.key] ?? "mapKampungBlurb"), { fontFamily: "monospace", fontSize: "12px", color: "#9fb4d0", wordWrap: { width: cardW - 24 }, align: "center" }).setOrigin(0.5);
      card.on("pointerover", () => card.setFillStyle(0x2b3a66));
      card.on("pointerout", () => card.setFillStyle(0x1c2640));
      card.on("pointerdown", () => this.pick(m.key));
      this.input.keyboard?.on(`keydown-${["ONE", "TWO", "THREE"][i]}`, () => this.pick(m.key));
    });

    const back = this.add.text(20, 20, t("back"), { fontFamily: "monospace", fontSize: "16px", color: "#9fb4d0" }).setInteractive({ useHandCursor: true });
    back.on("pointerdown", () => this.scene.start("Menu"));
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("Menu"));
  }

  private pick(mapKey: string): void {
    this.input.keyboard?.removeAllListeners();
    this.scene.start("Game", { mapKey, players: this.players });
  }
}
