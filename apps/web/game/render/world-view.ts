import * as Phaser from "phaser";
import type { World } from "@kampung/game-core";
import { enemySprite, pickupSprite, placeableSprite, playerSprite, projectileSprite, type SpriteRef } from "./atlas";
import type { LoadedMap } from "../maps";

type Img = Phaser.GameObjects.Image;

const BLINK_WINDOW = 4;
const RISE_TIME = 0.7;

/** Mirrors core state into Phaser objects. Never writes back into the World. */
export class WorldView {
  private readonly players = new Map<number, Img>();
  private readonly enemies = new Map<number, Img>();
  private readonly projectiles = new Map<number, Img>();
  private readonly placeables = new Map<number, Img>();
  private readonly pickups = new Map<number, Img>();
  private readonly shadows = new Map<number, Img>();
  private readonly flashUntil = new Map<number, number>();
  private readonly bars: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene, map: LoadedMap) {
    this.drawTerrain(map);
    this.bars = scene.add.graphics().setDepth(900);
  }

  private drawTerrain(map: LoadedMap): void {
    const rt = this.scene.add.renderTexture(0, 0, map.pixelWidth, map.pixelHeight).setOrigin(0).setDepth(-10);
    const cols = map.data.cols;
    for (const layer of [map.ground, map.decor]) {
      layer.forEach((gid, i) => {
        if (gid <= 0) return;
        rt.drawFrame("tiles", gid - 1, (i % cols) * map.tileSize, Math.floor(i / cols) * map.tileSize);
      });
    }
  }

  flash(id: number, nowMs: number, ms = 90): void {
    this.flashUntil.set(id, nowMs + ms);
  }

  private upsert<T extends { id: number }>(
    pool: Map<number, Img>,
    items: T[],
    ref: (t: T) => SpriteRef,
    update: (img: Img, t: T) => void,
  ): void {
    const seen = new Set<number>();
    for (const it of items) {
      seen.add(it.id);
      let img = pool.get(it.id);
      if (!img) {
        const r = ref(it);
        img = this.scene.add.image(0, 0, r.key, r.frame);
        pool.set(it.id, img);
      }
      update(img, it);
    }
    for (const [id, img] of pool) {
      if (seen.has(id)) continue;
      img.destroy();
      pool.delete(id);
      this.shadows.get(id)?.destroy();
      this.shadows.delete(id);
      this.flashUntil.delete(id);
    }
  }

  private shadowFor(id: number, x: number, y: number, scale: number): void {
    let s = this.shadows.get(id);
    if (!s) {
      s = this.scene.add.image(0, 0, "shadow");
      this.shadows.set(id, s);
    }
    s.setPosition(x, y + 6).setScale(scale).setDepth(y - 1);
  }

  private applyFlash(img: Img, id: number, nowMs: number): void {
    if ((this.flashUntil.get(id) ?? 0) > nowMs) img.setTintFill(0xffffff);
    else img.clearTint();
  }

  sync(world: World, nowMs: number): void {
    const t = world.time;

    this.upsert(
      this.players,
      world.players,
      (p) => playerSprite(p.id, 0, "idle"),
      (img, p) => {
        const ref = playerSprite(p.id, 0, "idle");
        img.setPosition(p.x, p.y).setDepth(p.y).setRotation(ref.rotates ? Math.atan2(p.facing.y, p.facing.x) : 0);
        img.setAlpha(p.alive ? 1 : 0.3);
        this.applyFlash(img, p.id, nowMs);
        this.shadowFor(p.id, p.x, p.y, 0.9);
        this.shadows.get(p.id)?.setVisible(p.alive);
      },
    );

    this.bars.clear();
    this.upsert(
      this.enemies,
      world.enemies,
      (e) => enemySprite(e.kind, 0, "walk"),
      (img, e) => {
        const rising = e.rise > 0;
        const prog = rising ? 1 - e.rise / RISE_TIME : 1;
        const hopY = e.kind === "pocong" ? Math.abs(Math.sin(e.hop)) * 4 : 0;
        img.setPosition(e.x, e.y - hopY + (1 - prog) * 10).setDepth(e.y);
        img.setAlpha(0.25 + 0.75 * prog);
        const ref = enemySprite(e.kind, 0, "walk");
        // Enemies face the nearest player via their own motion; a fixed facing keeps placeables readable.
        if (ref.rotates) img.setRotation(0);
        this.applyFlash(img, e.id, nowMs);
        this.shadowFor(e.id, e.x, e.y, e.radius / 10);
        if (e.hp < e.maxHp && !rising) {
          const w = e.radius * 2 + 6;
          const x = e.x - w / 2;
          const y = e.y - e.radius - 9;
          this.bars.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, 5);
          this.bars.fillStyle(0xd03030).fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 3);
        }
      },
    );

    this.upsert(
      this.projectiles,
      world.projectiles,
      (p) => projectileSprite(p.kind),
      (img, p) => {
        const ref = projectileSprite(p.kind);
        img.setPosition(p.x, p.y).setDepth(p.y + 20);
        img.setRotation(ref.rotates ? Math.atan2(p.vy, p.vx) : 0);
      },
    );

    this.upsert(
      this.placeables,
      world.placeables,
      (b) => placeableSprite(b.kind),
      (img, b) => {
        img.setPosition(b.x, b.y).setDepth(b.y);
        if (b.kind === "barricade") img.setTint(Phaser.Display.Color.GetColor(255, Math.floor(120 + (b.hp / 150) * 135), Math.floor(120 + (b.hp / 150) * 135)));
        if (b.kind === "mine") img.setAlpha(b.arm > 0 ? 0.45 : 1);
        if (b.kind === "barrel") img.setScale(b.fuse >= 0 ? 1 + 0.1 * Math.sin(t * 40) : 1);
      },
    );

    this.upsert(
      this.pickups,
      world.pickups,
      (p) => pickupSprite(p.kind),
      (img, p) => {
        const bob = Math.sin(p.age * 5) * 2;
        img.setPosition(p.x, p.y + bob).setDepth(p.y);
        const left = p.ttl - p.age;
        img.setVisible(left > BLINK_WINDOW || Math.floor(p.age * 8) % 2 === 0);
      },
    );
  }

  destroy(): void {
    for (const pool of [this.players, this.enemies, this.projectiles, this.placeables, this.pickups, this.shadows]) {
      pool.forEach((i) => i.destroy());
      pool.clear();
    }
    this.bars.destroy();
  }
}
