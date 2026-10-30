import type Phaser from "phaser";
import type { GameEvent, World } from "@kampung/game-core";
import { audio } from "../audio/audio";
import { eventToast } from "../hud-state";
import type { Lighting } from "./lighting";
import type { WorldView } from "./world-view";

/** Turns one-shot GameEvents into particles, shake, floating text, sound and toasts. */
export class Fx {
  private readonly burst: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly blood: Phaser.GameObjects.Particles.ParticleEmitter;
  private lastHitSound = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: WorldView,
    private readonly lighting: Lighting,
  ) {
    this.burst = scene.add.particles(0, 0, "spark", {
      emitting: false,
      lifespan: { min: 300, max: 650 },
      speed: { min: 60, max: 280 },
      scale: { start: 1.6, end: 0 },
      tint: [0xffe080, 0xff8020, 0xc03010],
      blendMode: "ADD",
    }).setDepth(900);
    this.blood = scene.add.particles(0, 0, "spark", {
      emitting: false,
      lifespan: { min: 200, max: 420 },
      speed: { min: 30, max: 120 },
      scale: { start: 1, end: 0 },
      tint: [0x9a1818, 0xcc2828],
    }).setDepth(900);
  }

  private toast(text: string): void {
    this.scene.game.events.emit("toast", text);
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: "monospace", fontSize: "14px", color, stroke: "#000000", strokeThickness: 3, fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(950);
    this.scene.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  handle(events: GameEvent[], world: World, nowMs: number): void {
    const cam = this.scene.cameras.main;
    for (const e of events) {
      const msg = eventToast(e);
      if (msg) this.toast(msg);
      switch (e.type) {
        case "shotFired": {
          audio.fire(e.weapon);
          const p = world.players[e.playerId];
          if (p) this.lighting.addFlash(p.x + p.facing.x * 14, p.y + p.facing.y * 14, 70, 0.07);
          break;
        }
        case "placed":
          audio.fire("pagarBuluh");
          break;
        case "enemyHit": {
          const en = world.enemies.find((x) => x.id === e.id);
          if (en) {
            this.view.flash(en.id, nowMs);
            this.blood.explode(3, en.x, en.y);
          }
          if (nowMs - this.lastHitSound > 45) {
            audio.hit();
            this.lastHitSound = nowMs;
          }
          break;
        }
        case "enemyKilled":
          this.blood.explode(10, e.x, e.y);
          this.floatText(e.x, e.y - 10, e.combo > 1 ? `+${e.points} x${e.combo}` : `+${e.points}`, e.combo > 1 ? "#ffd040" : "#ffffff");
          audio.kill();
          break;
        case "explosion": {
          this.burst.explode(Math.round(14 + e.radius / 3), e.x, e.y);
          this.lighting.addFlash(e.x, e.y, e.radius * 2.2, 0.35);
          const c = cam.worldView;
          const d = Math.hypot(e.x - c.centerX, e.y - c.centerY);
          cam.shake(140, Math.min(0.012, (e.radius / 90) * 0.006) * Math.max(0.3, 1 - d / 700));
          audio.explosion();
          break;
        }
        case "fireball":
          audio.fireball();
          break;
        case "pickup":
          audio.pickup();
          break;
        case "waveStarted":
          audio.wave();
          break;
        case "playerHurt": {
          const p = world.players[e.id];
          if (p) {
            this.view.flash(p.id, nowMs, 120);
            this.blood.explode(6, p.x, p.y);
          }
          cam.shake(120, 0.006);
          audio.hurt();
          break;
        }
        case "playerDowned":
          audio.death();
          break;
        case "levelUp":
          if (e.reward?.kind === "weapon") audio.weaponUnlocked();
          else if (e.reward) audio.upgrade();
          break;
        case "beam": {
          const line = this.scene.add.graphics().setDepth(940);
          line.lineStyle(5, 0xaee8ff, 1).lineBetween(e.x1, e.y1, e.x2, e.y2);
          this.scene.tweens.add({ targets: line, alpha: 0, duration: 200, onComplete: () => line.destroy() });
          cam.shake(80, 0.004);
          break;
        }
        case "gameOver":
          break;
      }
    }
  }

  destroy(): void {
    this.burst.destroy();
    this.blood.destroy();
  }
}
