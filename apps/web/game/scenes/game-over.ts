import * as Phaser from "phaser";
import { t } from "../../i18n";
import type { RunSummary } from "../constants";

/** Score submission UI arrives with the leaderboard milestone; the summary is kept for it. */
export class GameOverScene extends Phaser.Scene {
  private run!: RunSummary;

  constructor() {
    super("GameOver");
  }

  init(data: { run: RunSummary }): void {
    this.run = data.run;
    this.registry.set("lastRun", data.run);
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    this.cameras.main.setBackgroundColor("#0a0d16");
    this.add.text(cx, height * 0.18, t("gameOver"), { fontFamily: "monospace", fontSize: "48px", color: "#d03030", fontStyle: "bold" }).setOrigin(0.5);
    const secs = Math.round(this.run.durationMs / 1000);
    this.add.text(cx, height * 0.4, `${t("statScore")}  ${this.run.score}\n${t("statWave")}  ${this.run.wave}\n${t("statKills")}  ${this.run.kills}\n${t("statTime")}  ${Math.floor(secs / 60)}m ${secs % 60}s`, {
      fontFamily: "monospace", fontSize: "22px", color: "#ffffff", align: "center", lineSpacing: 8,
    }).setOrigin(0.5);

    const button = (y: number, label: string, run: () => void) => {
      const btn = this.add.text(cx, y, label, { fontFamily: "monospace", fontSize: "22px", color: "#ffffff", backgroundColor: "#243251", padding: { x: 18, y: 8 } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on("pointerover", () => btn.setBackgroundColor("#3a5088"));
      btn.on("pointerout", () => btn.setBackgroundColor("#243251"));
      btn.on("pointerdown", run);
    };
    const players = this.run.mode === "2p" ? 2 : 1;
    button(height * 0.7, t("playAgain"), () => this.scene.start("Game", { mapKey: this.run.map, players }));
    button(height * 0.7 + 54, t("menu"), () => this.scene.start("Menu"));
    button(height * 0.7 + 108, t("leaderboard"), () => { window.location.href = "/leaderboard"; });
  }
}
