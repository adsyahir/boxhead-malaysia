import * as THREE from "three";
import { createWorld, type GameEvent, type PlayerInput, type World } from "@kampung/game-core";
import type { RunSummary } from "../../game/constants";
import { advance, newRunSeed } from "../../game/fixed-step";
import { buildHudState, type HudState } from "../../game/hud-state";
import { isTouchDevice, sampleTouch } from "../../game/input/touch-state";
import { parseTiledMap, type LoadedMap } from "../../game/maps";
import { WindowKeyboard } from "../input/keyboard";
import { UNIT_BOX, UNIT_QUAD } from "./batch";
import { CameraRig } from "./camera";
import { toX, toZ } from "./coords";
import { EntityView } from "./entities";
import { FloatText } from "./float-text";
import { Fx } from "./fx";
import { NightLights, type LightQuality } from "./lights";
import { buildMap, type BuiltMap } from "./map-builder";
import { createMaterials, fadeUniforms, type Materials } from "./materials";
import { Particles } from "./particles";

const NIGHT = 0x070a14;

export type SceneName = "Menu" | "MapSelect" | "Game" | "GameOver";

export interface EngineCallbacks {
  onHud(state: HudState): void;
  onToast(text: string): void;
  /** The run just ended; the UI should start fading out. */
  onEnding(): void;
  onGameOver(run: RunSummary): void;
}

type Mode = "idle" | "backdrop" | "game" | "over";

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The Three.js client. Owns the renderer, the scene and the fixed-step loop around game-core.
 * React owns the menus/HUD and talks to this class through a handful of methods and callbacks.
 */
export class Engine {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly mats: Materials;
  private readonly lights: NightLights;
  private readonly cam = new CameraRig();
  private readonly particles = new Particles();
  private readonly view: EntityView;
  private readonly fx: Fx;
  private readonly floatText: FloatText;
  private readonly resizeObs: ResizeObserver;
  private readonly mapCache = new Map<string, LoadedMap>();
  private readonly touch = isTouchDevice();
  private built: { key: string; map: BuiltMap; loaded: LoadedMap } | null = null;

  private mode: Mode = "idle";
  private world: World | null = null;
  private mapKey = "kampung-pisang";
  private playerCount: 1 | 2 = 1;
  private keyboard: WindowKeyboard | null = null;
  private acc = 0;
  private paused = false;
  private ended = false;
  private frames = 0;
  private raf = 0;
  private last = 0;
  private token = 0;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private ambientT = 0;
  private width = 1;
  private height = 1;
  private disposed = false;
  private cpuMs = 0;

  constructor(private readonly host: HTMLElement, overlay: HTMLElement, private readonly cb: EngineCallbacks) {
    const quality: LightQuality = this.touch
      ? { lampLights: 3, dynamicLights: 2, shadows: false }
      : { lampLights: 6, dynamicLights: 4, shadows: true };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: dpr < 2, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.dataset.scene = "Menu";
    this.canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
    host.appendChild(this.canvas);

    this.scene.background = new THREE.Color(NIGHT);
    this.scene.fog = new THREE.Fog(NIGHT, 20, 46);

    this.mats = createMaterials();
    this.lights = new NightLights(quality);
    this.view = new EntityView(this.mats, quality.shadows);
    this.floatText = new FloatText(overlay);
    this.fx = new Fx(this.view, this.particles, this.lights, this.cam, this.floatText, (t) => this.cb.onToast(t));
    this.scene.add(this.lights.group, this.view.group, this.fx.group);

    // Debug-only query params: ?zoom=0.4 moves the camera closer, ?debug exposes the World for console poking.
    const params = new URLSearchParams(window.location.search);
    const dbg = Number(params.get("zoom"));
    if (dbg > 0.1 && dbg < 4) this.cam.debugScale = dbg;
    if (params.has("debug")) (window as unknown as { __kppWorld?: () => World | null }).__kppWorld = () => this.world;

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------------- public API ----------------

  setSceneName(name: SceneName): void {
    this.canvas.dataset.scene = name;
  }

  get currentMap(): string | null {
    return this.built?.key ?? null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Menu backdrop: the map without actors, slow orbiting camera. */
  async showBackdrop(key: string): Promise<void> {
    const my = ++this.token;
    const ok = await this.useMap(key);
    if (!ok || my !== this.token) return;
    this.endRun();
    this.mode = "backdrop";
  }

  async startGame(key: string, players: 1 | 2): Promise<void> {
    const my = ++this.token;
    const ok = await this.useMap(key);
    if (!ok || my !== this.token || !this.built) return;
    this.endRun();
    this.mapKey = key;
    this.playerCount = players;
    this.world = createWorld({ seed: newRunSeed(), map: this.built.loaded.data, playerCount: players });
    this.acc = 0;
    this.paused = false;
    this.ended = false;
    this.frames = 0;
    if (!this.touch) this.keyboard = new WindowKeyboard(players);
    const f = this.focusPoints();
    const fx = f.reduce((s, p) => s + p.x, 0) / f.length;
    const fz = f.reduce((s, p) => s + p.z, 0) / f.length;
    this.cam.snap(fx, fz);
    this.mode = "game";
    this.canvas.dataset.tick = "0";
    this.publishHud();
  }

  togglePause(): void {
    if (this.mode !== "game" || this.ended) return;
    this.paused = !this.paused;
    this.keyboard?.sample();
    this.publishHud();
  }

  dispose(): void {
    this.disposed = true;
    this.token++;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.endRun();
    this.built?.map.dispose();
    this.built = null;
    this.view.dispose();
    this.fx.dispose();
    this.floatText.dispose();
    this.lights.dispose();
    this.mats.dispose();
    // module-level shared geometries: dispose only frees GPU buffers, a later Engine re-uploads them
    UNIT_BOX.dispose();
    UNIT_QUAD.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // ---------------- internals ----------------

  private async loadMap(key: string): Promise<LoadedMap> {
    const hit = this.mapCache.get(key);
    if (hit) return hit;
    const res = await fetch(`/maps/${key}.json`);
    if (!res.ok) throw new Error(`Map ${key}: HTTP ${res.status}`);
    const loaded = parseTiledMap(await res.json());
    this.mapCache.set(key, loaded);
    return loaded;
  }

  private async useMap(key: string): Promise<boolean> {
    if (this.built?.key === key) return true;
    const loaded = await this.loadMap(key);
    if (this.disposed) return false;
    if (this.built?.key === key) return true;
    if (this.built) {
      this.scene.remove(this.built.map.group);
      this.built.map.dispose();
    }
    const map = buildMap(loaded, this.mats, hashKey(key));
    this.scene.add(map.group);
    this.lights.setLamps(map.lamps);
    this.built = { key, map, loaded };
    this.particles.clear();
    return true;
  }

  private endRun(): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = null;
    this.keyboard?.destroy();
    this.keyboard = null;
    this.world = null;
    this.paused = false;
    this.ended = false;
    this.view.reset();
    this.fx.clear();
    this.floatText.clear();
    this.lights.clearTransient();
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.cam.resize(w, h);
  }

  private focusPoints(): { x: number; z: number }[] {
    if (!this.world) return [];
    const alive = this.world.players.filter((p) => p.alive);
    const list = alive.length > 0 ? alive : this.world.players;
    return list.map((p) => ({ x: toX(p.x), z: toZ(p.y) }));
  }

  private sampleInputs(): { inputs: PlayerInput[]; swapTapped: boolean[] } {
    if (this.touch) return sampleTouch();
    return this.keyboard ? this.keyboard.sample() : { inputs: [], swapTapped: [] };
  }

  private publishHud(): void {
    if (this.world) this.cb.onHud(buildHudState(this.world, this.paused));
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
    this.cb.onEnding();
    this.endTimer = setTimeout(() => {
      this.endTimer = null;
      this.mode = "over";
      this.keyboard?.destroy();
      this.keyboard = null;
      this.cb.onGameOver(run);
    }, 1100);
  }

  private stepGame(frameDt: number, nowMs: number): void {
    const world = this.world!;
    const sampled = this.sampleInputs();
    let events: GameEvent[] = [];
    if (!this.paused && !this.ended) ({ acc: this.acc, events } = advance(world, sampled, this.acc, frameDt));
    this.fx.handle(events, world, nowMs);
    for (const e of events) if (e.type === "gameOver") this.finish(e);

    if (++this.frames % 6 === 0 || events.length > 0) this.publishHud();
    if (this.frames % 20 === 0) {
      const d = this.canvas.dataset;
      d.tick = String(world.tick);
      d.players = world.players.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join("|");
      d.ms = this.cpuMs.toFixed(2);
    }
  }

  private ambient(dt: number): void {
    this.ambientT += dt;
    if (this.ambientT < 0.12) return;
    this.ambientT = 0;
    for (const c of this.built?.map.chimneys ?? []) {
      this.particles.emit({ count: 1, x: c.x, y: c.y, z: c.z, colors: [0x4a4a50, 0x5a5a60, 0x3a3a40], speed: [0.1, 0.3], up: [0.5, 0.9], life: [2, 3], size: [0.2, 0.3], grow: 0.35, gravity: -0.05, drag: 0.3, spread: 0.2 });
    }
    // kunang-kunang (fireflies) drifting around the view
    if (Math.random() < 0.5) {
      const f = this.cam.focus;
      this.particles.emit({ count: 1, x: f.x + (Math.random() - 0.5) * 22, y: 0.4 + Math.random() * 1.2, z: f.z + (Math.random() - 0.5) * 14, colors: [0xc8ff70, 0xeaff9a], speed: [0.1, 0.4], up: [-0.1, 0.2], life: [2, 3.5], size: [0.035, 0.05], glow: true, gravity: 0, drag: 0 });
    }
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const frameDt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    if (this.mode === "idle" || !this.built) {
      this.renderer.render(this.scene, this.cam.camera);
      return;
    }
    const frozen = this.paused;
    const vdt = frozen ? 0 : frameDt;
    const world = this.world;

    if (this.mode === "game" && world) {
      this.stepGame(frameDt, now);
      this.view.sync(world, now, vdt, this.particles, this.lights);
      this.cam.follow(this.focusPoints(), frameDt, { w: this.built.map.width, d: this.built.map.depth });
    } else {
      if (this.mode === "over" && world) this.view.sync(world, now, 0, this.particles, this.lights);
      else this.view.drawParticlesOnly(this.particles);
      const m = this.built.map;
      this.cam.backdrop(frameDt, { x: m.width / 2, z: m.depth / 2 });
    }

    if (!frozen) {
      this.ambient(frameDt);
      this.particles.update(frameDt);
      this.fx.update(frameDt);
    }

    const players = (world?.players ?? []).map((p) => ({ x: toX(p.x), z: toZ(p.y), alive: p.alive && this.mode === "game" }));
    this.lights.update(vdt, now / 1000, this.cam.focus, players);

    // see-through circles for the players
    const fu = fadeUniforms;
    const pa = world && this.mode === "game" ? world.players[0] : undefined;
    const pb = world && this.mode === "game" ? world.players[1] : undefined;
    fu.uFadeOn.value.set(pa ? 1 : 0, pb ? 1 : 0);
    if (pa) fu.uFadeA.value.set(toX(pa.x), 0.55, toZ(pa.y));
    if (pb) fu.uFadeB.value.set(toX(pb.x), 0.55, toZ(pb.y));

    const fog = this.scene.fog as THREE.Fog;
    const d = this.cam.distance;
    fog.near = d * 1.05;
    fog.far = d * 2.5;

    this.floatText.update(vdt, this.cam.camera, this.width, this.height);
    this.renderer.render(this.scene, this.cam.camera);
    // smoothed CPU cost of a frame (sim + scene sync + draw submission), exposed as data-ms for profiling
    this.cpuMs += (performance.now() - now - this.cpuMs) * 0.05;
  };
}
