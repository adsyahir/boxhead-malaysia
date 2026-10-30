import * as THREE from "three";

/**
 * Night lighting. Three.js recompiles shaders when the number of lights changes, so every pool has
 * a fixed size and unused lights simply sit at intensity 0.
 *  - hemisphere + a dim moon (the only shadow caster, a single directional shadow map)
 *  - one warm lantern per player
 *  - the N pelita nearest to the camera focus get real point lights, the rest only glow
 *  - a small pool of short-lived lights for muzzle flashes, explosions and fireballs
 */
export interface LightQuality {
  lampLights: number;
  dynamicLights: number;
  shadows: boolean;
}

interface Flash {
  x: number; y: number; z: number;
  color: number;
  intensity: number;
  distance: number;
  ttl: number;
  life: number;
}

export class NightLights {
  readonly group = new THREE.Group();
  readonly moon: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly players: THREE.PointLight[] = [];
  private readonly lamps: THREE.PointLight[] = [];
  private readonly dyn: THREE.PointLight[] = [];
  private flashes: Flash[] = [];
  private frameReq: Omit<Flash, "ttl" | "life">[] = [];
  private lampPositions: THREE.Vector3[] = [];

  constructor(private readonly q: LightQuality) {
    this.hemi = new THREE.HemisphereLight(0x5a6ea8, 0x1c1a14, 1.15);
    this.group.add(this.hemi);

    this.moon = new THREE.DirectionalLight(0x9db4ff, 0.9);
    this.moon.position.set(-18, 34, -14);
    this.moon.castShadow = q.shadows;
    if (q.shadows) {
      this.moon.shadow.mapSize.set(2048, 2048);
      const c = this.moon.shadow.camera;
      c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 90;
      this.moon.shadow.bias = -0.0008;
      this.moon.shadow.normalBias = 0.03;
      this.moon.shadow.radius = 3;
    }
    this.group.add(this.moon, this.moon.target);

    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffd6a0, 0, 11, 1.4);
      this.players.push(l);
      this.group.add(l);
    }
    for (let i = 0; i < q.lampLights; i++) {
      const l = new THREE.PointLight(0xff9a40, 0, 8, 1.5);
      this.lamps.push(l);
      this.group.add(l);
    }
    for (let i = 0; i < q.dynamicLights; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 8, 1.6);
      this.dyn.push(l);
      this.group.add(l);
    }
  }

  setLamps(p: THREE.Vector3[]): void {
    this.lampPositions = p;
  }

  /** A timed light (explosion, muzzle flash). */
  flash(x: number, y: number, z: number, color: number, intensity: number, distance: number, ttl: number): void {
    this.flashes.push({ x, y, z, color, intensity, distance, ttl, life: ttl });
    if (this.flashes.length > 24) this.flashes.shift();
  }

  /** A light that exists for this frame only (fireball, rocket, lit fuse). */
  request(x: number, y: number, z: number, color: number, intensity: number, distance: number): void {
    this.frameReq.push({ x, y, z, color, intensity, distance });
  }

  /** Keep the moon's shadow frustum centred on what the camera looks at. */
  private aimMoon(fx: number, fz: number): void {
    // snap to texel-ish steps to stop shadow edges from crawling while the camera glides
    const sx = Math.round(fx * 2) / 2;
    const sz = Math.round(fz * 2) / 2;
    this.moon.target.position.set(sx, 0, sz);
    this.moon.position.set(sx - 16, 34, sz - 12);
  }

  update(
    dt: number,
    time: number,
    focus: THREE.Vector3,
    players: { x: number; z: number; alive: boolean }[],
  ): void {
    this.aimMoon(focus.x, focus.z);

    for (let i = 0; i < this.players.length; i++) {
      const l = this.players[i]!;
      const p = players[i];
      if (p && p.alive) {
        l.position.set(p.x, 2.1, p.z + 0.35);
        l.intensity = 14 + Math.sin(time * 9 + i) * 0.4;
      } else l.intensity = 0;
    }

    // nearest pelita get the real lights
    if (this.lamps.length > 0) {
      const sorted = this.lampPositions
        .map((p, i) => ({ p, i, d: (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 }))
        .sort((a, b) => a.d - b.d);
      for (let i = 0; i < this.lamps.length; i++) {
        const l = this.lamps[i]!;
        const s = sorted[i];
        if (!s) {
          l.intensity = 0;
          continue;
        }
        l.position.set(s.p.x, s.p.y + 0.15, s.p.z);
        l.intensity = 7 + Math.sin(time * 11 + s.i * 1.7) * 0.8 + Math.sin(time * 23 + s.i) * 0.4;
      }
    }

    for (const f of this.flashes) f.ttl -= dt;
    this.flashes = this.flashes.filter((f) => f.ttl > 0);
    const wants = [
      ...this.flashes.map((f) => ({ ...f, intensity: f.intensity * (f.ttl / f.life) })),
      ...this.frameReq,
    ].sort((a, b) => b.intensity - a.intensity);
    for (let i = 0; i < this.dyn.length; i++) {
      const l = this.dyn[i]!;
      const w = wants[i];
      if (!w) {
        l.intensity = 0;
        continue;
      }
      l.position.set(w.x, w.y, w.z);
      l.color.setHex(w.color);
      l.intensity = w.intensity;
      l.distance = w.distance;
    }
    this.frameReq = [];
  }

  clearTransient(): void {
    this.flashes = [];
    this.frameReq = [];
  }

  dispose(): void {
    this.moon.shadow.map?.dispose();
    this.moon.dispose();
    this.hemi.dispose();
    for (const l of [...this.players, ...this.lamps, ...this.dyn]) l.dispose();
  }
}
