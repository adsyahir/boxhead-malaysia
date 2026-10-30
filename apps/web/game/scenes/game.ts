import * as Phaser from "phaser";
import { createWorld, type GameEvent, type PlayerInput, type World } from "@kampung/game-core";
import { VIEW_WORLD_HEIGHT, VIEW_WORLD_WIDTH, MIN_ZOOM_FACTOR, type RunSummary } from "../constants";
import { audio } from "../audio/audio";
import { advance, newRunSeed } from "../fixed-step";
import { HUD_KEY, buildHudState } from "../hud-state";
import { KeyboardInput } from "../input/keyboard";
import { isTouchDevice, sampleTouch } from "../input/touch";
import { parseTiledMap, type LoadedMap } from "../maps";
import { Fx } from "../render/fx";
import { Lighting } from "../render/lighting";
import { WorldView } from "../render/world-view";

export class GameScene extends Phaser.Scene {
  private mapKey = "kampung-pisang";
  private playerCount: 1 | 2 = 1;
  private world!: World;
  private map!: LoadedMap;
  private view!: WorldView;
  private lighting!: Lighting;
  private fx!: Fx;
  private keyboard: KeyboardInput | null = null;
  private touch = false;
  private acc = 0;
  private paused = false;
  private ended = false;
  private camX = 0;
  private camY = 0;
  private zoomFactor = 1;
  private frames = 0;

  constructor() {
    super("Game");
  }

  init(data: { mapKey?: string; players?: 1 | 2 }): void {
    this.mapKey = data.mapKey ?? "kampung-pisang";
    this.playerCount = data.players ?? 1;
    this.acc = 0;
    this.paused = false;
    this.ended = false;
    this.zoomFactor = 1;
    this.frames = 0;
  }

  create(): void {
    this.map = parseTiledMap(this.cache.json.get(this.mapKey));
    this.world = createWorld({ seed: newRunSeed(), map: this.map.data, playerCount: this.playerCount });

    const cam = this.cameras.main;
    cam.setBackgroundColor("#000000");
    cam.setBounds(0, 0, this.map.pixelWidth, this.map.pixelHeight);
    cam.setZoom(this.baseZoom());
    const focus = this.cameraFocus();
    this.camX = focus.x;
    this.camY = focus.y;
    cam.centerOn(this.camX, this.camY);

    this.view = new WorldView(this, this.map);
    this.lighting = new Lighting(this, this.map);
    this.fx = new Fx(this, this.view, this.lighting);

    this.touch = isTouchDevice();
    if (!this.touch) {
      this.keyboard = new KeyboardInput(this, this.playerCount);
      this.input.keyboard?.on("keydown-P", () => this.togglePause());
      this.input.keyboard?.on("keydown-ESC", () => this.togglePause());
      this.input.keyboard?.on("keydown-M", () => audio.toggleMute());
    }
    this.scale.on("resize", this.onResize, this);

    this.scene.launch("Hud");
    this.events.once("shutdown", () => this.cleanup());
    this.game.canvas.dataset.scene = "Game";
  }

  private baseZoom(): number {
    return Math.min(this.scale.width / VIEW_WORLD_WIDTH, this.scale.height / VIEW_WORLD_HEIGHT);
  }

  private onResize(): void {
    this.cameras.main.setZoom(this.baseZoom() * this.zoomFactor);
  }

  private togglePause(): void {
    if (this.ended) return;
    this.paused = !this.paused;
  }

  private cleanup(): void {
    this.scale.off("resize", this.onResize, this);
    this.keyboard?.destroy();
    this.view.destroy();
    this.lighting.destroy();
    this.fx.destroy();
    this.registry.remove(HUD_KEY);
    this.scene.stop("Hud");
  }

  private cameraFocus(): { x: number; y: number } {
    const alive = this.world.players.filter((p) => p.alive);
    const list = alive.length > 0 ? alive : this.world.players;
    const x = list.reduce((s, p) => s + p.x, 0) / list.length;
    const y = list.reduce((s, p) => s + p.y, 0) / list.length;
    return { x, y };
  }

  /** Zoom out (down to MIN_ZOOM_FACTOR) so two spread-out players stay on screen. */
  private targetZoomFactor(): number {
    const alive = this.world.players.filter((p) => p.alive);
    if (alive.length < 2) return 1;
    const a = alive[0]!;
    const b = alive[1]!;
    const spanX = Math.abs(a.x - b.x) + 220;
    const spanY = Math.abs(a.y - b.y) + 220;
    const fit = Math.min(VIEW_WORLD_WIDTH / spanX, VIEW_WORLD_HEIGHT / spanY);
    return Phaser.Math.Clamp(fit, MIN_ZOOM_FACTOR, 1);
  }

  private sampleInputs(): { inputs: PlayerInput[]; swapTapped: boolean[] } {
    if (this.touch) return sampleTouch();
    return this.keyboard ? this.keyboard.sample() : { inputs: [], swapTapped: [] };
  }

  override update(time: number, deltaMs: number): void {
    const frameDt = Math.min(deltaMs / 1000, 0.25);
    const sampled = this.sampleInputs();
    let events: GameEvent[] = [];
    if (!this.paused && !this.ended) ({ acc: this.acc, events } = advance(this.world, sampled, this.acc, frameDt));

    this.fx.handle(events, this.world, time);
    for (const e of events) if (e.type === "gameOver") this.finish(e);

    this.view.sync(this.world, time);
    this.updateCamera(frameDt);
    this.lighting.update(this.cameras.main, this.world, this.paused ? 0 : frameDt);
    this.publishHud();

    if (++this.frames % 20 === 0) {
      const d = this.game.canvas.dataset;
      d.tick = String(this.world.tick);
      d.players = this.world.players.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join("|");
    }
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const k = 1 - Math.exp(-8 * dt);
    const f = this.cameraFocus();
    this.camX += (f.x - this.camX) * k;
    this.camY += (f.y - this.camY) * k;
    this.zoomFactor += (this.targetZoomFactor() - this.zoomFactor) * (1 - Math.exp(-4 * dt));
    cam.setZoom(this.baseZoom() * this.zoomFactor);
    cam.centerOn(this.camX, this.camY);
  }

  private publishHud(): void {
    this.registry.set(HUD_KEY, buildHudState(this.world, this.paused));
  }

  private finish(e: Extract<GameEvent, { type: "gameOver" }>): void {
    if (this.ended) return;
    this.ended = true;
    const run: RunSummary = {
      score: e.score,
      wave: Math.max(1, e.wave),
      kills: e.kills,
      durationMs: e.durationMs,
      map: this.mapKey,
      mode: this.playerCount === 2 ? "2p" : "1p",
    };
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.time.delayedCall(1100, () => this.scene.start("GameOver", { run }));
  }
}
