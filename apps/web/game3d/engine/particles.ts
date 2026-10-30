import * as THREE from "three";
import type { BoxBatch } from "./batch";

/** Voxel debris: tiny tumbling cubes simulated on the CPU and drawn into the shared box batches. */
interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; grow: number;
  gravity: number; drag: number;
  spin: number; rx: number; ry: number;
  color: THREE.Color;
  glow: boolean;
  fade: boolean;
}

export interface EmitOpts {
  count: number;
  x: number; y: number; z: number;
  colors: number[];
  speed: [number, number];
  up?: [number, number];
  life: [number, number];
  size: [number, number];
  grow?: number;
  gravity?: number;
  drag?: number;
  glow?: boolean;
  /** horizontal spread radius of spawn position */
  spread?: number;
  /** preferred direction (unit x,z) and cone; omitted = all around */
  dir?: [number, number];
  cone?: number;
}

const MAX = 1800;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Particles {
  private readonly list: P[] = [];
  private readonly free: P[] = [];

  emit(o: EmitOpts): void {
    for (let i = 0; i < o.count; i++) {
      if (this.list.length >= MAX) return;
      const p = this.free.pop() ?? ({ color: new THREE.Color() } as P);
      let a = Math.random() * Math.PI * 2;
      if (o.dir) a = Math.atan2(o.dir[0], o.dir[1]) + (Math.random() - 0.5) * (o.cone ?? 1);
      const sp = rand(o.speed[0], o.speed[1]);
      const sr = o.spread ?? 0;
      p.x = o.x + (Math.random() - 0.5) * sr;
      p.y = o.y;
      p.z = o.z + (Math.random() - 0.5) * sr;
      p.vx = Math.sin(a) * sp;
      p.vz = Math.cos(a) * sp;
      p.vy = o.up ? rand(o.up[0], o.up[1]) : 0;
      p.max = p.life = rand(o.life[0], o.life[1]);
      p.size = rand(o.size[0], o.size[1]);
      p.grow = o.grow ?? 0;
      p.gravity = o.gravity ?? 14;
      p.drag = o.drag ?? 1.5;
      p.spin = rand(-12, 12);
      p.rx = Math.random() * 6;
      p.ry = Math.random() * 6;
      p.color.set(o.colors[Math.floor(Math.random() * o.colors.length)]!);
      p.glow = o.glow ?? false;
      p.fade = p.glow;
      this.list.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.list[i] = this.list[this.list.length - 1]!;
        this.list.pop();
        this.free.push(p);
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.grow * dt;
      const floor = p.size * 0.5;
      if (p.y < floor) {
        p.y = floor;
        if (p.vy < 0) p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
        p.spin *= 0.5;
      }
      p.rx += p.spin * dt;
      p.ry += p.spin * 0.7 * dt;
    }
  }

  draw(lit: BoxBatch, glow: BoxBatch): void {
    for (const p of this.list) {
      const t = p.life / p.max;
      const s = p.size * (p.fade ? Math.min(1, t * 1.6) : Math.min(1, t * 4));
      if (s <= 0.002) continue;
      (p.glow ? glow : lit).box(p.color, p.x, p.y, p.z, s, s, s, p.rx, p.ry, 0);
    }
  }

  clear(): void {
    this.free.push(...this.list);
    this.list.length = 0;
  }
}
