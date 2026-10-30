import * as THREE from "three";

/** 3/4 view: the camera sits south of the focus (+z), raised by PITCH, looking down at it. */
const PITCH = THREE.MathUtils.degToRad(56);
const FOV = 38;
/** How much of the ground the default view should show (scene units), a little tighter than the Phaser 800x450 view (25x14 tiles) so the voxel models read. */
const VIEW_W = 18;
const VIEW_H = 10.5;
export const MAX_ZOOM_OUT = 1.45;

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 140);
  /** Smoothed focus point on the ground. */
  readonly focus = new THREE.Vector3(30, 0, 20);
  private zoom = 1;
  private trauma = 0;
  private shakeT = 0;
  private orbit = 0;
  /** Debug only: `/play?zoom=0.5` brings the camera closer for inspecting models. */
  debugScale = 1;

  /** Distance that fits VIEW_W x VIEW_H of ground for the current aspect. */
  baseDistance(): number {
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dH = VIEW_H / (2 * t / Math.sin(PITCH));
    const dW = VIEW_W / (2 * t * this.camera.aspect);
    return Math.max(dH, dW);
  }

  get distance(): number {
    return this.baseDistance() * this.zoom * this.debugScale;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Add screen shake; amount ~0.1 small hit, ~0.5 big explosion. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snap(x: number, z: number, zoom = 1): void {
    this.focus.set(x, 0, z);
    this.zoom = zoom;
  }

  /**
   * Follow the given points: centre on their midpoint and pull back (up to MAX_ZOOM_OUT)
   * until all of them fit with a margin.
   */
  follow(points: { x: number; z: number }[], dt: number, bounds: { w: number; d: number }): void {
    if (points.length > 0) {
      let x = 0;
      let z = 0;
      for (const p of points) {
        x += p.x;
        z += p.z;
      }
      x /= points.length;
      z /= points.length;
      // keep the view mostly over the map
      x = THREE.MathUtils.clamp(x, 7, bounds.w - 7);
      z = THREE.MathUtils.clamp(z, 4.5, bounds.d - 3.5);
      const k = 1 - Math.exp(-8 * dt);
      this.focus.x += (x - this.focus.x) * k;
      this.focus.z += (z - this.focus.z) * k;
    }
    let want = 1;
    if (points.length >= 2) {
      const a = points[0]!;
      const b = points[1]!;
      const spanX = Math.abs(a.x - b.x) + 7;
      const spanZ = Math.abs(a.z - b.z) + 7;
      want = THREE.MathUtils.clamp(Math.max(spanX / VIEW_W, spanZ / VIEW_H), 1, MAX_ZOOM_OUT);
    }
    this.zoom += (want - this.zoom) * (1 - Math.exp(-4 * dt));
    this.place(dt, 0);
  }

  /** Slow orbit used behind the menus. */
  backdrop(dt: number, center: { x: number; z: number }): void {
    this.orbit += dt * 0.06;
    this.focus.set(center.x + Math.sin(this.orbit) * 9, 0, center.z + Math.cos(this.orbit * 0.8) * 5);
    this.zoom = 1.12;
    this.place(dt, Math.sin(this.orbit * 0.7) * 0.35);
  }

  private place(dt: number, yaw: number): void {
    const d = this.distance;
    const c = this.camera;
    const horiz = Math.cos(PITCH) * d;
    c.position.set(this.focus.x + Math.sin(yaw) * horiz, 0.5 + Math.sin(PITCH) * d, this.focus.z + Math.cos(yaw) * horiz);
    c.lookAt(this.focus.x, 0.5, this.focus.z);
    if (this.trauma > 0) {
      this.shakeT += dt * 40;
      const s = this.trauma * this.trauma * 0.35;
      c.position.x += Math.sin(this.shakeT * 1.3) * s;
      c.position.y += Math.sin(this.shakeT * 1.7 + 1) * s * 0.6;
      c.position.z += Math.sin(this.shakeT * 1.1 + 2) * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }
  }
}
