import * as Phaser from "phaser";
import { t, weaponName } from "../../i18n";
import { WEAPON_IDS } from "@kampung/game-core";
import { audio } from "../audio/audio";
import { HUD_KEY, waveLabel, type HudState } from "../hud-state";
import { TouchControls, isTouchDevice } from "../input/touch";

const BAR_W = 150;

export class HudScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private score!: Phaser.GameObjects.Text;
  private wave!: Phaser.GameObjects.Text;
  private combo!: Phaser.GameObjects.Text;
  private unlocks!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private pause!: Phaser.GameObjects.Text;
  private mute!: Phaser.GameObjects.Text;
  private touch: TouchControls | null = null;
  private toasts: string[] = [];
  private toastTimer = 0;
  private readonly onToast = (t: string) => this.toasts.push(t);

  constructor() {
    super("Hud");
  }

  create(): void {
    const style = { fontFamily: "monospace", fontSize: "14px", color: "#ffffff", stroke: "#000000", strokeThickness: 3 };
    this.gfx = this.add.graphics();
    this.playerTexts = [0, 1].map(() => this.add.text(0, 0, "", style));
    this.score = this.add.text(0, 0, "", { ...style, fontSize: "20px", fontStyle: "bold" }).setOrigin(0.5, 0);
    this.wave = this.add.text(0, 0, "", { ...style, color: "#ffd24a" }).setOrigin(0.5, 0);
    this.combo = this.add.text(0, 0, "", { ...style, fontSize: "22px", color: "#ffd24a", fontStyle: "bold" }).setOrigin(0.5, 0);
    this.unlocks = this.add.text(0, 0, "", { ...style, fontSize: "11px" }).setOrigin(0.5, 1);
    this.toastText = this.add.text(0, 0, "", { ...style, fontSize: "24px", fontStyle: "bold" }).setOrigin(0.5).setAlpha(0);
    this.pause = this.add.text(0, 0, `${t("paused")}\n${t("resumeKeys")}`, { ...style, fontSize: "30px", align: "center", fontStyle: "bold" }).setOrigin(0.5).setVisible(false);
    this.mute = this.add.text(0, 6, "", { fontSize: "22px" }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.mute.on("pointerdown", () => {
      audio.unlock();
      audio.toggleMute();
    });

    if (isTouchDevice()) this.touch = new TouchControls(this);

    this.game.events.on("toast", this.onToast);
    this.events.once("shutdown", () => this.game.events.off("toast", this.onToast));
  }

  override update(_t: number, delta: number): void {
    const s = this.registry.get(HUD_KEY) as HudState | undefined;
    const { width, height } = this.scale;
    this.mute.setText(audio.muted ? t("soundOff") : t("soundOn")).setX(width - 10);
    this.touch?.draw();
    if (!s) return;

    const g = this.gfx;
    g.clear();
    s.players.forEach((p, i) => {
      const right = i === 1;
      const x = right ? width - 14 - BAR_W - 40 : 14;
      const y = 12;
      g.fillStyle(0x000000, 0.6).fillRect(x - 2, y + 16, BAR_W + 4, 12);
      const frac = Math.max(0, p.hp / p.maxHp);
      g.fillStyle(frac > 0.35 ? 0x48c048 : 0xd03030).fillRect(x, y + 18, BAR_W * frac, 8);
      const ammo = Number.isFinite(p.ammo) ? String(p.ammo) : "∞";
      this.playerTexts[i]!
        .setText(`${p.name}${p.alive ? "" : ` ${t("down")}`}\n${weaponName(p.weapon)} ${ammo}`)
        .setPosition(x, y + (p.alive ? 0 : 0))
        .setLineSpacing(14)
        .setY(y - 2);
      this.playerTexts[i]!.setVisible(true);
    });
    for (let i = s.players.length; i < this.playerTexts.length; i++) this.playerTexts[i]!.setVisible(false);

    this.score.setText(`${t("score")} ${s.score}`).setPosition(width / 2, 8);
    this.wave.setText(waveLabel(s)).setPosition(width / 2, 34);
    this.combo.setText(s.combo > 1 ? t("combo", { n: s.combo }) : "").setPosition(width / 2, 56);

    const row = WEAPON_IDS.map((id, i) => (s.unlocked.includes(id) ? `${(i + 1) % 10}.${weaponName(id)}` : `${(i + 1) % 10}.---`)).join("  ");
    this.unlocks.setText(row).setPosition(width / 2, height - 6).setVisible(!this.touch);

    this.pause.setPosition(width / 2, height / 2).setVisible(s.paused);

    this.toastTimer -= delta;
    if (this.toastTimer <= 0 && this.toasts.length > 0) {
      this.toastText.setText(this.toasts.shift()!).setAlpha(1);
      this.toastTimer = 1600;
    }
    this.toastText.setPosition(width / 2, height * 0.3);
    if (this.toastTimer < 400) this.toastText.setAlpha(Math.max(0, this.toastTimer / 400));
  }
}
