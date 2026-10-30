import * as THREE from "three";
import { WEAPONS, type EnemyKind, type GameEvent, type World } from "@kampung/game-core";
import { audio } from "../../game/audio/audio";
import { eventToast } from "../../game/hud-state";
import type { CameraRig } from "./camera";
import { toX, toZ } from "./coords";
import type { EntityView } from "./entities";
import type { FloatText } from "./float-text";
import type { NightLights } from "./lights";
import type { Particles } from "./particles";

export const GIBS: Record<EnemyKind, number[]> = {
  pocong: [0xe9e4d4, 0xd8d2c0, 0xa8a290, 0x8c9478],
  toyol: [0x5fa04a, 0x3f7a34, 0x8a2020],
  pontianak: [0xe6e6ee, 0x0b0b10, 0xd8d6cc, 0x0b0b10],
};
const BLOOD = [0x8a1010, 0xb01818, 0x5a0808];

interface Blast {
  sphere: THREE.Mesh;
  ring: THREE.Mesh;
  age: number;
  life: number;
  radius: number;
  active: boolean;
}

interface Beam {
  mesh: THREE.Mesh;
  age: number;
  active: boolean;
}

const BEAM_LIFE = 0.22;

/** Turns one-shot GameEvents into particles, shake, light flashes, floating text, sound and toasts. */
export class Fx {
  readonly group = new THREE.Group();
  private readonly blasts: Blast[] = [];
  private readonly sphereGeo = new THREE.IcosahedronGeometry(1, 1);
  private readonly ringGeo = new THREE.RingGeometry(0.75, 1, 24).rotateX(-Math.PI / 2);
  private readonly sphereMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  private readonly beams: Beam[] = [];
  private readonly beamGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly beamMat = new THREE.MeshBasicMaterial({ color: 0xaee8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  private lastHitSound = 0;

  constructor(
    private readonly view: EntityView,
    private readonly particles: Particles,
    private readonly lights: NightLights,
    private readonly cam: CameraRig,
    private readonly text: FloatText,
    private readonly toast: (t: string) => void,
  ) {
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(this.beamGeo, this.beamMat.clone());
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.beams.push({ mesh, age: 0, active: false });
    }
    for (let i = 0; i < 6; i++) {
      const sphere = new THREE.Mesh(this.sphereGeo, this.sphereMat.clone());
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat.clone());
      sphere.visible = ring.visible = false;
      sphere.renderOrder = ring.renderOrder = 3;
      this.group.add(sphere, ring);
      this.blasts.push({ sphere, ring, age: 0, life: 0.45, radius: 1, active: false });
    }
  }

  private distToFocus(x: number, z: number): number {
    return Math.hypot(x - this.cam.focus.x, z - this.cam.focus.z);
  }

  private blast(x: number, z: number, radius: number): void {
    const b = this.blasts.find((q) => !q.active) ?? this.blasts[0]!;
    b.active = true;
    b.age = 0;
    b.radius = radius;
    b.sphere.position.set(x, 0.3, z);
    b.ring.position.set(x, 0.05, z);
    b.sphere.visible = b.ring.visible = true;
  }

  handle(events: GameEvent[], world: World, nowMs: number): void {
    for (const e of events) {
      const msg = eventToast(e);
      if (msg) this.toast(msg);
      switch (e.type) {
        case "shotFired": {
          audio.fire(e.weapon);
          const p = world.players[e.playerId];
          if (!p) break;
          this.view.recoil(e.playerId);
          const kind = WEAPONS[e.weapon].kind;
          if (kind === "bullet" || kind === "pellets" || kind === "rocket") {
            const mx = toX(p.x + p.facing.x * 16);
            const mz = toZ(p.y + p.facing.y * 16);
            this.lights.flash(mx, 0.9, mz, 0xffc070, kind === "bullet" && e.weapon === "lastik" ? 3 : 8, 5, 0.07);
            if (e.weapon !== "lastik") {
              this.particles.emit({ count: kind === "pellets" ? 6 : 2, x: mx, y: 0.62, z: mz, colors: [0xffe080, 0xffa030], speed: [1.5, 4], up: [0, 1], life: [0.05, 0.12], size: [0.05, 0.09], glow: true, gravity: 0, dir: [p.facing.x, p.facing.y], cone: 0.8 });
            }
          }
          break;
        }
        case "placed":
          audio.fire("pagarBuluh");
          this.particles.emit({ count: 8, x: toX(e.x), y: 0.05, z: toZ(e.y), colors: [0x6a4a2a, 0x8a6a3a], speed: [0.5, 1.5], up: [1, 2.5], life: [0.3, 0.6], size: [0.05, 0.1] });
          break;
        case "enemyHit": {
          const en = world.enemies.find((x) => x.id === e.id);
          if (en) {
            this.view.flash(en.id, nowMs);
            this.particles.emit({ count: 4, x: toX(en.x), y: 0.6, z: toZ(en.y), colors: en.kind === "toyol" ? [0x2a6a1a, 0x8a1010] : BLOOD, speed: [0.8, 2.2], up: [1, 3], life: [0.3, 0.6], size: [0.05, 0.09] });
          }
          if (nowMs - this.lastHitSound > 45) {
            audio.hit();
            this.lastHitSound = nowMs;
          }
          break;
        }
        case "enemyKilled": {
          const x = toX(e.x);
          const z = toZ(e.y);
          this.particles.emit({ count: 12, x, y: 0.5, z, colors: GIBS[e.kind], speed: [1, 3.2], up: [2, 5], life: [0.6, 1.3], size: [0.08, 0.16], spread: 0.3 });
          this.particles.emit({ count: 10, x, y: 0.4, z, colors: BLOOD, speed: [0.8, 2.5], up: [1, 3.5], life: [0.4, 0.9], size: [0.05, 0.1] });
          if (e.kind === "pontianak") this.particles.emit({ count: 10, x, y: 1, z, colors: [0xff2a10, 0xff6a30], speed: [0.3, 1.2], up: [0.5, 2], life: [0.4, 0.9], size: [0.05, 0.1], glow: true, gravity: -0.5 });
          this.text.add(x, 1.4, z, e.combo > 1 ? `+${e.points} x${e.combo}` : `+${e.points}`, e.combo > 1 ? "#ffd040" : "#ffffff");
          audio.kill();
          break;
        }
        case "explosion": {
          const x = toX(e.x);
          const z = toZ(e.y);
          const r = toX(e.radius);
          this.blast(x, z, r);
          this.particles.emit({ count: Math.round(18 + e.radius / 4), x, y: 0.4, z, colors: [0xffe080, 0xff8020, 0xff5010, 0xffc040], speed: [2, 6], up: [1, 5], life: [0.25, 0.6], size: [0.1, 0.22], glow: true, gravity: 3, drag: 3 });
          this.particles.emit({ count: 9, x, y: 0.3, z, colors: [0x262626, 0x333333, 0x1e1a18], speed: [0.6, 2.2], up: [1, 2.2], life: [0.5, 1.0], size: [0.14, 0.24], grow: 0.22, gravity: -0.4, drag: 2.5, spread: r * 0.7 });
          this.particles.emit({ count: 10, x, y: 0.2, z, colors: [0x2a1a10, 0x4a3020, 0x111111], speed: [2, 5], up: [3, 7], life: [0.6, 1.2], size: [0.06, 0.14] });
          this.lights.flash(x, 1.6, z, 0xffa040, 40, r * 5 + 4, 0.4);
          const d = this.distToFocus(x, z);
          this.cam.shake(Math.min(0.55, (e.radius / 90) * 0.5) * Math.max(0.3, 1 - d / 22));
          audio.explosion();
          break;
        }
        case "fireball":
          audio.fireball();
          break;
        case "pickup":
          audio.pickup();
          {
            const p = world.players[e.playerId];
            if (p) this.particles.emit({ count: 10, x: toX(p.x), y: 0.5, z: toZ(p.y), colors: e.kind === "ketupat" ? [0xb8f050, 0xffffff] : [0xffd24a, 0xffffff], speed: [0.5, 1.5], up: [1.5, 3], life: [0.3, 0.6], size: [0.04, 0.08], glow: true, gravity: 2 });
          }
          break;
        case "waveStarted":
          audio.wave();
          break;
        case "playerHurt": {
          const p = world.players[e.id];
          if (p) {
            this.view.flash(p.id, nowMs, 120, true);
            this.particles.emit({ count: 6, x: toX(p.x), y: 0.6, z: toZ(p.y), colors: BLOOD, speed: [0.8, 2], up: [1, 3], life: [0.3, 0.6], size: [0.05, 0.09] });
          }
          this.cam.shake(0.22);
          audio.hurt();
          break;
        }
        case "playerDowned":
          audio.death();
          break;
        case "beam": {
          const x1 = toX(e.x1);
          const z1 = toZ(e.y1);
          const x2 = toX(e.x2);
          const z2 = toZ(e.y2);
          const len = Math.hypot(x2 - x1, z2 - z1);
          const b = this.beams.find((q) => !q.active) ?? this.beams[0]!;
          b.active = true;
          b.age = 0;
          b.mesh.visible = true;
          b.mesh.position.set((x1 + x2) / 2, 0.62, (z1 + z2) / 2);
          b.mesh.rotation.set(0, Math.atan2(-(z2 - z1), x2 - x1), 0);
          b.mesh.scale.set(Math.max(0.1, len), 0.09, 0.09);
          this.particles.emit({ count: Math.min(14, 4 + Math.round(len)), x: (x1 + x2) / 2, y: 0.62, z: (z1 + z2) / 2, colors: [0xaee8ff, 0xffffff, 0x7ac8ff], speed: [0.2, 1.1], up: [-0.1, 0.5], life: [0.15, 0.4], size: [0.04, 0.09], glow: true, gravity: 0, drag: 2, spread: len * 0.45 });
          this.lights.flash(x2, 0.8, z2, 0x9ad8ff, 18, 6, 0.25);
          this.cam.shake(0.12);
          break;
        }
        case "levelUp": {
          for (const p of world.players) {
            if (p.alive) this.particles.emit({ count: 16, x: toX(p.x), y: 0.5, z: toZ(p.y), colors: [0xffd24a, 0xffffff, 0xffa030], speed: [0.8, 2.2], up: [2, 4.5], life: [0.4, 0.9], size: [0.05, 0.1], glow: true, gravity: 2 });
          }
          if (e.reward?.kind === "weapon") audio.weaponUnlocked();
          else if (e.reward) audio.upgrade();
          break;
        }
        case "gameOver":
          break;
      }
    }
  }

  update(dt: number): void {
    for (const q of this.beams) {
      if (!q.active) continue;
      q.age += dt;
      const f = q.age / BEAM_LIFE;
      if (f >= 1) {
        q.active = false;
        q.mesh.visible = false;
        continue;
      }
      (q.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - f;
      q.mesh.scale.y = q.mesh.scale.z = 0.09 * (1 - f * 0.6);
    }
    for (const b of this.blasts) {
      if (!b.active) continue;
      b.age += dt;
      const t = b.age / b.life;
      if (t >= 1) {
        b.active = false;
        b.sphere.visible = b.ring.visible = false;
        continue;
      }
      const s = b.radius * (0.35 + 0.75 * Math.pow(t, 0.5));
      b.sphere.scale.set(s, s * 0.8, s);
      (b.sphere.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
      (b.sphere.material as THREE.MeshBasicMaterial).color.setHSL(0.08 - t * 0.06, 1, 0.6 - t * 0.3);
      const rs = b.radius * (0.4 + 1.0 * t);
      b.ring.scale.set(rs, 1, rs);
      (b.ring.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.7;
    }
  }

  clear(): void {
    for (const b of this.blasts) {
      b.active = false;
      b.sphere.visible = b.ring.visible = false;
    }
    for (const q of this.beams) {
      q.active = false;
      q.mesh.visible = false;
    }
  }

  dispose(): void {
    this.sphereGeo.dispose();
    this.ringGeo.dispose();
    this.sphereMat.dispose();
    this.ringMat.dispose();
    for (const b of this.blasts) {
      (b.sphere.material as THREE.Material).dispose();
      (b.ring.material as THREE.Material).dispose();
    }
    this.beamGeo.dispose();
    this.beamMat.dispose();
    for (const q of this.beams) (q.mesh.material as THREE.Material).dispose();
  }
}
