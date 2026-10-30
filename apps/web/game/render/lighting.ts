import type Phaser from "phaser";
import type { World } from "@kampung/game-core";
import { DARKNESS_ALPHA } from "../constants";
import type { LoadedMap } from "../maps";

export interface LightFlash {
  x: number;
  y: number;
  radius: number;
  ttl: number;
  life: number;
}

const LIGHT_TEX = 256;

/** Night overlay: a screen-sized render texture filled with darkness, with light circles erased from it. */
export class Lighting {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly stamp: Phaser.GameObjects.Image;
  readonly flashes: LightFlash[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly map: LoadedMap) {
    const { width, height } = scene.scale;
    this.rt = scene.add.renderTexture(0, 0, width, height).setOrigin(0).setScrollFactor(0).setDepth(1000);
    this.stamp = scene.make.image({ key: "light" }, false);
    scene.scale.on("resize", this.onResize, this);
  }

  private onResize(size: Phaser.Structs.Size): void {
    this.rt.resize(size.width, size.height);
  }

  addFlash(x: number, y: number, radius: number, ttl: number): void {
    this.flashes.push({ x, y, radius, ttl, life: ttl });
  }

  private light(cam: Phaser.Cameras.Scene2D.Camera, wx: number, wy: number, radius: number, alpha = 1): void {
    const sx = (wx - cam.worldView.x) * cam.zoom;
    const sy = (wy - cam.worldView.y) * cam.zoom;
    const r = radius * cam.zoom;
    if (sx < -r || sy < -r || sx > this.rt.width + r || sy > this.rt.height + r) return;
    this.stamp.setPosition(sx, sy).setScale((r * 2) / LIGHT_TEX).setAlpha(alpha);
    this.rt.erase(this.stamp);
  }

  update(cam: Phaser.Cameras.Scene2D.Camera, world: World, dt: number): void {
    this.rt.fill(0x05060e, DARKNESS_ALPHA);
    const t = world.time;

    for (const p of world.players) {
      if (p.alive) this.light(cam, p.x, p.y, 190);
    }
    this.map.lights.forEach((l, i) => this.light(cam, l.x, l.y, 120 + Math.sin(t * 7 + i * 1.7) * 6, 0.9));
    for (const pr of world.projectiles) {
      if (pr.kind === "fireball") this.light(cam, pr.x, pr.y, 80, 0.9);
      else if (pr.kind === "rocket") this.light(cam, pr.x, pr.y, 60, 0.7);
    }
    for (const b of world.placeables) {
      if (b.kind === "barrel" && b.fuse >= 0) this.light(cam, b.x, b.y, 70, 0.8);
    }
    for (const f of this.flashes) {
      f.ttl -= dt;
      this.light(cam, f.x, f.y, f.radius, Math.max(0, f.ttl / f.life));
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) if (this.flashes[i]!.ttl <= 0) this.flashes.splice(i, 1);
  }

  destroy(): void {
    this.scene.scale.off("resize", this.onResize, this);
    this.rt.destroy();
    this.stamp.destroy();
  }
}
