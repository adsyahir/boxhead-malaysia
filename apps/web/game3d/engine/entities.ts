import * as THREE from "three";
import { BALANCE, WEAPONS, type Enemy, type Pickup, type Placeable, type Projectile, type World } from "@kampung/game-core";
import { BoxBatch, UNIT_QUAD } from "./batch";
import { lerpAngle, toX, toZ, yawOf } from "./coords";
import type { NightLights } from "./lights";
import type { Materials } from "./materials";
import type { Particles } from "./particles";
import { ENEMY_RIGS, PLAYER_RIGS, drawRig, neutralPose, type Pose } from "./rigs";

const RISE_TIME = BALANCE.riseTime;
const PLAYER_GLOW = [0x5aa0ff, 0xff7ab8];

interface Anim {
  x: number;
  z: number;
  yaw: number;
  phase: number;
  speed: number;
  flashUntil: number;
  recoil: number;
  extra: number;
  seen: boolean;
}

const root = new THREE.Matrix4();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

function rootMatrix(out: THREE.Matrix4, x: number, y: number, z: number, yaw: number, lie = 0, sx = 1, sy = 1, sz = 1, roll = 0): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(lie, yaw, roll, "YXZ"));
  return out.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
}

/**
 * Mirrors World into instanced boxes every frame. Read-only towards the World, like the Phaser WorldView.
 * All actors, props, particles and HP bars share two box batches (lit + glow) plus two quad batches.
 */
export class EntityView {
  readonly group = new THREE.Group();
  readonly lit: BoxBatch;
  readonly glow: BoxBatch;
  private readonly blobs: BoxBatch;
  private readonly halos: BoxBatch;
  private readonly anim = new Map<number, Anim>();
  private readonly barricadeYaw = new Map<number, number>();
  private readonly playerAnim: Anim[] = [];
  private readonly pose: Pose = neutralPose();

  constructor(mats: Materials, shadows: boolean) {
    this.lit = new BoxBatch(mats.actor, 7000, { cast: shadows, receive: true, dynamic: true, name: "actors" });
    this.glow = new BoxBatch(mats.glow, 4000, { dynamic: true, name: "actors-glow" });
    this.blobs = new BoxBatch(mats.blob, 400, { dynamic: true, geometry: UNIT_QUAD, name: "blob-shadows" });
    this.halos = new BoxBatch(mats.additive, 300, { dynamic: true, geometry: UNIT_QUAD, name: "halos" });
    this.blobs.mesh.renderOrder = 1;
    this.halos.mesh.renderOrder = 2;
    this.group.add(this.lit.mesh, this.glow.mesh, this.blobs.mesh, this.halos.mesh);
  }

  flash(id: number, nowMs: number, ms = 90, player = false): void {
    const a = player ? this.playerAnim[id] : this.anim.get(id);
    if (a) a.flashUntil = nowMs + ms;
  }

  recoil(playerId: number): void {
    const a = this.playerAnim[playerId];
    if (a) a.recoil = 1;
  }

  private getAnim(map: Map<number, Anim>, id: number, x: number, z: number, yaw: number): Anim {
    let a = map.get(id);
    if (!a) {
      a = { x, z, yaw, phase: Math.random() * 10, speed: 0, flashUntil: 0, recoil: 0, extra: 0, seen: false };
      map.set(id, a);
    }
    return a;
  }

  private track(a: Anim, x: number, z: number, dt: number): void {
    const dist = Math.hypot(x - a.x, z - a.z);
    const sp = dt > 0 ? dist / dt : 0;
    a.speed += (sp - a.speed) * Math.min(1, dt * 12);
    a.phase += dist * 9;
    if (dist > 0.0005) {
      const target = yawOf(x - a.x, z - a.z);
      a.yaw = lerpAngle(a.yaw, target, 1 - Math.exp(-12 * dt));
    }
    a.x = x;
    a.z = z;
  }

  private blob(x: number, z: number, size: number, alpha = 1): void {
    tmpM.makeScale(size * alpha, 1, size * alpha * 0.85).setPosition(x, 0.015, z);
    this.blobs.pushMatrix(tmpM, 0x000000);
  }

  private halo(x: number, z: number, size: number, color: number, y = 0.02): void {
    tmpM.makeScale(size, 1, size).setPosition(x, y, z);
    this.halos.pushMatrix(tmpM, color);
  }

  sync(world: World, nowMs: number, dt: number, particles: Particles, lights: NightLights): void {
    const t = world.time;
    const real = nowMs / 1000;
    this.lit.begin();
    this.glow.begin();
    this.blobs.begin();
    this.halos.begin();

    this.drawPlayers(world, nowMs, dt, real);
    this.drawEnemies(world, nowMs, dt, real, particles);
    for (const p of world.projectiles) this.drawProjectile(p, real, particles, lights, dt);
    for (const b of world.placeables) this.drawPlaceable(world, b, t, real, lights);
    for (const p of world.pickups) this.drawPickup(p);
    particles.draw(this.lit, this.glow);

    this.lit.end();
    this.glow.end();
    this.blobs.end();
    this.halos.end();
  }

  /** Only the particles (used behind menus and after game over). */
  drawParticlesOnly(particles: Particles): void {
    this.lit.begin();
    this.glow.begin();
    this.blobs.begin();
    this.halos.begin();
    particles.draw(this.lit, this.glow);
    this.lit.end();
    this.glow.end();
    this.blobs.end();
    this.halos.end();
  }

  private drawPlayers(world: World, nowMs: number, dt: number, real: number): void {
    const two = world.players.length > 1;
    world.players.forEach((p, i) => {
      const x = toX(p.x);
      const z = toZ(p.y);
      let a = this.playerAnim[i];
      if (!a) {
        a = { x, z, yaw: yawOf(p.facing.x, p.facing.y), phase: 0, speed: 0, flashUntil: 0, recoil: 0, extra: 0, seen: true };
        this.playerAnim[i] = a;
      }
      const dist = Math.hypot(x - a.x, z - a.z);
      a.speed += ((dt > 0 ? dist / dt : 0) - a.speed) * Math.min(1, dt * 12);
      a.phase += dist * 8.5;
      a.x = x;
      a.z = z;
      a.yaw = lerpAngle(a.yaw, yawOf(p.facing.x, p.facing.y), 1 - Math.exp(-22 * dt));
      a.recoil = Math.max(0, a.recoil - dt * 9);
      // downed: ease into lying on the back
      a.extra += ((p.alive ? 0 : 1) - a.extra) * Math.min(1, dt * 6);

      const walk = Math.min(1, a.speed / 3);
      const sw = Math.sin(a.phase) * 0.75 * walk;
      const bob = Math.abs(Math.sin(a.phase)) * 0.05 * walk;
      const pose = this.pose;
      pose.legL = sw;
      pose.legR = -sw;
      const aim = -1.42 + a.recoil * 0.35;
      pose.armR = aim;
      pose.armL = aim + 0.12 + Math.sin(a.phase) * 0.05 * walk;
      pose.headYaw = 0;
      pose.headPitch = 0.05;
      pose.bodyPitch = 0.06 * walk;
      if (a.extra > 0.01) {
        pose.armL = pose.armR = -0.3 * a.extra + aim * (1 - a.extra);
        pose.legL = pose.legR = 0;
      }
      const lie = -Math.PI / 2 * a.extra;
      rootMatrix(root, x, bob + a.extra * 0.14, z, a.yaw, lie);
      const flash = nowMs < a.flashUntil ? 1 : 0;
      drawRig(PLAYER_RIGS[i % 2]!, root, pose, this.lit, this.glow, { flash, shade: p.alive ? 1 : 0.55, held: p.alive ? p.weapon : undefined });
      if (p.alive) {
        this.blob(x, z, 0.85);
        this.halo(x, z, 2.2, i === 0 ? 0x24324a : 0x4a2438);
        if (two) {
          const c = PLAYER_GLOW[i]!;
          const hy = 1.42 + Math.sin(real * 4 + i) * 0.04;
          this.glow.box(c, x, hy, z, 0.14, 0.14, 0.14, Math.PI / 4, real * 2, Math.PI / 4);
        }
      } else {
        // pulsing ring so a partner can find the downed player
        const pulse = 0.6 + 0.4 * Math.sin(real * 5);
        this.halo(x, z, 1.6 + pulse * 0.6, 0x501818);
      }
    });
  }

  private drawEnemies(world: World, nowMs: number, dt: number, real: number, particles: Particles): void {
    const seen = new Set<number>();
    for (const e of world.enemies) {
      seen.add(e.id);
      const x = toX(e.x);
      const z = toZ(e.y);
      const a = this.getAnim(this.anim, e.id, x, z, this.faceNearest(world, e));
      if (!a.seen) {
        a.seen = true;
        if (e.rise > 0) particles.emit({ count: 14, x, y: 0.05, z, colors: [0x5a3a22, 0x3a2614, 0x6a4a2a], speed: [0.6, 2], up: [2, 4.5], life: [0.4, 0.9], size: [0.06, 0.14], spread: 0.5 });
      }
      this.track(a, x, z, dt);
      if (a.speed < 0.05 && e.rise <= 0) a.yaw = lerpAngle(a.yaw, this.faceNearest(world, e), 1 - Math.exp(-4 * dt));

      const rising = e.rise > 0;
      const prog = rising ? Math.max(0, 1 - e.rise / RISE_TIME) : 1;
      const sink = rising ? -Math.pow(1 - prog, 1.4) * 1.5 : 0;
      const shakeX = rising ? Math.sin(real * 60 + e.id) * 0.03 : 0;
      const flash = nowMs < a.flashUntil ? 1 : 0;
      const pose = this.pose;
      pose.headYaw = 0;
      pose.headPitch = 0;
      let y = sink;
      let sy = 1;
      let lean = 0;
      let roll = 0;
      const rig = ENEMY_RIGS[e.kind];

      if (e.kind === "pocong") {
        const s = Math.abs(Math.sin(e.hop));
        y += rising ? 0 : s * 0.34;
        sy = rising ? 1 : 1 - 0.14 * Math.pow(1 - s, 6) + 0.05 * s;
        lean = 0.12;
        pose.legL = pose.legR = pose.armL = pose.armR = 0;
        pose.headPitch = 0.05 * Math.sin(e.hop * 2);
      } else if (e.kind === "toyol") {
        const sw = Math.sin(a.phase * 1.4) * 0.95 * Math.min(1, a.speed / 2);
        pose.legL = sw;
        pose.legR = -sw;
        pose.armL = -sw * 1.2 - 0.3;
        pose.armR = sw * 1.2 - 0.3;
        y += Math.abs(Math.sin(a.phase * 1.4)) * 0.05;
        roll = Math.sin(a.phase * 0.7) * 0.08;
        lean = 0.2;
      } else {
        y += rising ? 0 : 0.14 + Math.sin(real * 2.4 + e.id) * 0.06;
        pose.legL = pose.legR = 0;
        const reach = -1.3 + Math.sin(real * 3 + e.id) * 0.1;
        pose.armL = reach;
        pose.armR = reach + Math.sin(real * 3.3 + e.id) * 0.08;
        pose.headPitch = -0.08;
        roll = Math.sin(real * 1.7 + e.id) * 0.05;
        lean = 0.1;
      }
      pose.bodyPitch = lean;
      rootMatrix(root, x + shakeX, y, z, a.yaw, 0, 1, sy, 1, roll);
      drawRig(rig, root, pose, this.lit, this.glow, { flash, shade: rising ? 0.6 + 0.4 * prog : 1 });

      const r = toX(e.radius);
      if (rising) {
        // dirt mound pushed up while it claws out
        const m = 1 - prog * 0.6;
        this.lit.box(0x4a3020, x, 0.06 * m, z, r * 2.6 * m, 0.12 * m, r * 2.4 * m);
        this.lit.box(0x3a2416, x + 0.1, 0.1 * m, z - 0.06, r * 1.2 * m, 0.1 * m, r * 1.1 * m);
      } else {
        const lift = e.kind === "pontianak" ? 0.75 : e.kind === "pocong" ? 1 - Math.abs(Math.sin(e.hop)) * 0.3 : 1;
        this.blob(x, z, r * 2.8, lift);
        if (e.kind === "pontianak") this.halo(x, z, 1.3, 0x2a0606);
      }

      if (e.hp < e.maxHp && !rising) {
        const w = (e.radius * 2 + 6) / 32;
        const top = e.kind === "pontianak" ? 1.75 : e.kind === "toyol" ? 0.95 : 1.55;
        const hy = top + y - sink;
        const frac = Math.max(0, e.hp / e.maxHp);
        this.glow.box(0x0a0a0a, x, hy, z, w + 0.04, 0.09, 0.02);
        this.glow.box(frac > 0.5 ? 0xd03030 : 0xff5020, x - (w * (1 - frac)) / 2, hy, z + 0.012, w * frac, 0.06, 0.02);
      }
    }
    for (const id of this.anim.keys()) if (!seen.has(id)) this.anim.delete(id);
  }

  private faceNearest(world: World, e: Enemy): number {
    let best = Infinity;
    let yaw = 0;
    for (const p of world.players) {
      if (!p.alive) continue;
      const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
      if (d < best) {
        best = d;
        yaw = yawOf(p.x - e.x, p.y - e.y);
      }
    }
    return yaw;
  }

  private drawProjectile(p: Projectile, real: number, particles: Particles, lights: NightLights, dt: number): void {
    const x = toX(p.x);
    const z = toZ(p.y);
    const yaw = yawOf(p.vx, p.vy);
    switch (p.kind) {
      case "bullet":
        rootMatrix(root, x, 0.62, z, yaw);
        this.glow.box(0xfff0a0, 0, 0, 0, 0.07, 0.07, 0.34, 0, 0, 0, root);
        this.glow.box(0xff9a30, 0, 0, -0.22, 0.05, 0.05, 0.2, 0, 0, 0, root);
        break;
      case "pellet":
        rootMatrix(root, x, 0.6, z, yaw);
        this.glow.box(0xffd060, 0, 0, 0, 0.06, 0.06, 0.2, 0, 0, 0, root);
        break;
      case "rocket": {
        rootMatrix(root, x, 0.7, z, yaw);
        this.lit.box(0x6a8a3a, 0, 0, 0, 0.16, 0.16, 0.5, 0, 0, 0, root);
        this.lit.box(0x4a6a2a, 0, 0, 0.1, 0.18, 0.18, 0.04, 0, 0, 0, root);
        this.glow.box(0xffd060, 0, 0, -0.3, 0.1, 0.1, 0.12, 0, 0, real * 30, root);
        this.glow.box(0xff6a1a, 0, 0, -0.4, 0.14, 0.14, 0.1, 0, 0, real * 20, root);
        if (Math.random() < dt * 60) {
          const bx = x - Math.sin(yaw) * 0.4;
          const bz = z - Math.cos(yaw) * 0.4;
          particles.emit({ count: 1, x: bx, y: 0.7, z: bz, colors: [0x3a3a3a, 0x4a4a4a], speed: [0, 0.3], up: [0.3, 0.8], life: [0.4, 0.7], size: [0.08, 0.14], grow: 0.2, gravity: 0, drag: 2 });
          particles.emit({ count: 1, x: bx, y: 0.7, z: bz, colors: [0xffa040, 0xffd060], speed: [0.2, 0.8], up: [0, 0.5], life: [0.15, 0.3], size: [0.06, 0.1], glow: true, gravity: 0 });
        }
        lights.request(x, 1.0, z, 0xffa040, 9, 6);
        this.blob(x, z, 0.4);
        break;
      }
      case "fireball": {
        const s = 0.3 + Math.sin(real * 25 + p.id) * 0.04;
        rootMatrix(root, x, 0.8, z, real * 6);
        this.glow.box(0xff4a10, 0, 0, 0, s, s, s, real * 5, 0, real * 3, root);
        this.glow.box(0xffc040, 0, 0, 0, s * 0.6, s * 0.6, s * 0.6, 0, real * 7, 0, root);
        if (Math.random() < dt * 45) {
          particles.emit({ count: 1, x, y: 0.8, z, colors: [0xff4a10, 0xff8a20, 0xffc040], speed: [0, 0.4], up: [0.4, 1.2], life: [0.2, 0.45], size: [0.07, 0.14], glow: true, gravity: -1, spread: 0.15 });
        }
        lights.request(x, 1.1, z, 0xff5a1a, 10, 6.5);
        this.halo(x, z, 1.4, 0x6a2006);
        break;
      }
      case "grenade": {
        const fuse = WEAPONS.bomIkan.fuse ?? 1;
        const prog = 1 - Math.max(0, p.life) / fuse;
        const hop = Math.abs(Math.sin(prog * Math.PI * 2.2)) * 0.6 * (1 - prog) + 0.1;
        rootMatrix(root, x, hop, z, real * 8);
        this.lit.box(0x2a2a22, 0, 0, 0, 0.18, 0.18, 0.18, 0.4, 0, 0.4, root);
        this.lit.box(0x3a3a30, 0, 0, 0, 0.2, 0.12, 0.12, 0, 0.6, 0, root);
        if (Math.floor(real * 14) % 2 === 0) this.glow.box(0xffb040, 0, 0.13, 0, 0.06, 0.08, 0.06, 0, 0, 0, root);
        this.blob(x, z, 0.35);
        break;
      }
    }
  }

  private drawPlaceable(world: World, b: Placeable, t: number, real: number, lights: NightLights): void {
    const x = toX(b.x);
    const z = toZ(b.y);
    if (b.kind === "barricade") {
      let yaw = this.barricadeYaw.get(b.id);
      if (yaw === undefined) {
        // span perpendicular to whoever placed it (nearest player's facing)
        let best = Infinity;
        yaw = 0;
        for (const p of world.players) {
          const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2;
          if (d < best) {
            best = d;
            yaw = yawOf(p.facing.x, p.facing.y);
          }
        }
        this.barricadeYaw.set(b.id, yaw);
        if (this.barricadeYaw.size > 200) this.barricadeYaw.delete(this.barricadeYaw.keys().next().value!);
      }
      const hp = Math.max(0, Math.min(1, b.hp / (WEAPONS.pagarBuluh.hp ?? 150)));
      rootMatrix(root, x, 0, z, yaw);
      const fresh = tmpC.setHex(0x9aa044).lerp(new THREE.Color(0x5a3a1e), 1 - hp);
      for (let i = 0; i < 5; i++) {
        const h = 0.75 + ((i * 37) % 5) * 0.05 - (1 - hp) * ((i * 13) % 3) * 0.12;
        this.lit.box(fresh, -0.36 + i * 0.18, h / 2, 0, 0.12, h, 0.12, 0, 0, ((i % 2) - 0.5) * 0.08 * (1 - hp), root);
      }
      this.lit.box(0x6a5228, 0, 0.3, 0.07, 0.92, 0.06, 0.05, 0, 0, 0, root);
      this.lit.box(0x6a5228, 0, 0.6, 0.07, 0.92, 0.06, 0.05, 0, 0, 0, root);
      this.lit.box(0x6a5228, 0, 0.45, -0.07, 0.92, 0.06, 0.05, 0, 0, 0.5, root);
      this.blob(x, z, 1.0);
    } else if (b.kind === "barrel") {
      const lit = b.fuse >= 0;
      const pulse = lit ? 1 + 0.1 * Math.sin(t * 40) : 1;
      rootMatrix(root, x, 0, z, 0.3, 0, pulse, pulse, pulse);
      const red = lit && Math.floor(real * 16) % 2 === 0 ? 0xff6a50 : 0xc0302a;
      this.lit.box(red, 0, 0.29, 0, 0.36, 0.5, 0.26, 0, 0, 0, root);
      this.lit.box(red, 0, 0.29, 0, 0.26, 0.5, 0.36, 0, 0, 0, root);
      this.lit.box(0xd0d0d0, 0, 0.58, 0, 0.22, 0.08, 0.22, 0, 0, 0, root);
      this.lit.box(0x404040, 0, 0.66, 0, 0.06, 0.08, 0.06, 0, 0, 0, root);
      this.lit.box(0xe8e0c0, 0, 0.3, 0.181, 0.16, 0.1, 0.01, 0, 0, 0, root);
      this.blob(x, z, 0.8);
      if (lit) {
        this.glow.box(0xffd060, 0, 0.74, 0, 0.08, 0.1, 0.08, 0, real * 20, 0, root);
        lights.request(x, 1, z, 0xff7030, 6, 5);
      }
    } else {
      const armed = b.arm <= 0;
      rootMatrix(root, x, 0, z, 0);
      const shade = armed ? 1 : 0.5;
      this.lit.box(tmpC.setHex(0xb02020).multiplyScalar(shade), 0, 0.1, 0, 0.22, 0.18, 0.18, 0, 0, 0, root);
      this.lit.box(tmpC.setHex(0xb02020).multiplyScalar(shade), 0, 0.1, 0, 0.18, 0.18, 0.22, 0, 0, 0, root);
      this.lit.box(0xe0c040, 0, 0.1, 0, 0.23, 0.04, 0.23, 0, 0, 0, root);
      this.lit.box(0x3a2a1a, 0, 0.22, 0, 0.03, 0.06, 0.03, 0, 0, 0, root);
      if (armed && Math.floor(real * 3) % 2 === 0) {
        this.glow.box(0xff3020, 0, 0.27, 0, 0.05, 0.05, 0.05, 0, 0, 0, root);
        this.halo(x, z, 0.7, 0x401008);
      }
      this.blob(x, z, 0.45);
    }
  }

  private drawPickup(p: Pickup): void {
    const left = p.ttl - p.age;
    if (left <= BALANCE.pickupBlink && Math.floor(p.age * 8) % 2 !== 0) return;
    const x = toX(p.x);
    const z = toZ(p.y);
    const bob = 0.28 + Math.sin(p.age * 5) * 0.06;
    const spin = p.age * 1.6;
    rootMatrix(root, x, bob, z, spin);
    if (p.kind === "ketupat") {
      this.lit.box(0xb8c050, 0, 0, 0, 0.24, 0.24, 0.24, Math.PI / 4, 0, Math.PI / 4, root);
      this.lit.box(0x7a8a30, 0, 0, 0, 0.26, 0.03, 0.26, 0, Math.PI / 4, 0, root);
      this.lit.box(0x7a8a30, 0, 0, 0, 0.03, 0.3, 0.03, 0, 0, 0, root);
      this.lit.box(0x9aa040, 0.05, 0.22, 0, 0.03, 0.14, 0.03, 0, 0, 0.5, root);
      this.halo(x, z, 1.1, 0x2a4a14);
    } else if (p.kind === "ammo") {
      this.lit.box(0x4a5a2a, 0, 0, 0, 0.38, 0.22, 0.26, 0, 0, 0, root);
      this.lit.box(0xe0b030, 0, 0, 0.131, 0.3, 0.05, 0.01, 0, 0, 0, root);
      for (let i = 0; i < 3; i++) this.lit.box(0xd0a030, -0.1 + i * 0.1, 0.16, 0, 0.05, 0.1, 0.05, 0, 0, 0, root);
      this.halo(x, z, 1.1, 0x4a3a10);
    } else {
      this.lit.box(0x8a5a2a, 0, 0.04, 0, 0.42, 0.42, 0.42, 0, 0, 0, root);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.lit.box(0x5a3a1a, sx * 0.19, 0.04, sz * 0.19, 0.06, 0.44, 0.06, 0, 0, 0, root);
      this.lit.box(0x5a3a1a, 0, 0.04, 0.212, 0.44, 0.06, 0.01, 0, 0, 0.78, root);
      this.glow.box(0xffd24a, 0, 0.27, 0, 0.12, 0.04, 0.12, 0, 0, 0, root);
      this.halo(x, z, 1.4, 0x4a3a08);
    }
    this.blob(x, z, 0.55);
  }

  reset(): void {
    this.anim.clear();
    this.barricadeYaw.clear();
    this.playerAnim.length = 0;
  }

  dispose(): void {
    this.lit.dispose();
    this.glow.dispose();
    this.blobs.dispose();
    this.halos.dispose();
  }
}
