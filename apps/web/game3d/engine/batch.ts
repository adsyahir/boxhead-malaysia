import * as THREE from "three";

/** One unit cube shared by every box in the game. Everything voxel-ish is a scaled instance of it. */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** Flat 1x1 quad lying on the ground (normal +y), for blob shadows and glow pools. */
export const UNIT_QUAD = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Builds a box matrix: scale (w,h,d), rotate (rx,ry,rz XYZ), translate to the box centre, then apply parent. */
export function boxMatrix(
  out: THREE.Matrix4,
  x: number, y: number, z: number,
  w: number, h: number, d: number,
  rx = 0, ry = 0, rz = 0,
  parent?: THREE.Matrix4,
): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
  out.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(w, h, d));
  if (parent) out.premultiply(parent);
  return out;
}

/**
 * A pool of instanced unit boxes. Dynamic batches are refilled every frame (begin/push/end);
 * static batches are filled once with an exact capacity.
 */
export class BoxBatch {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;

  constructor(
    material: THREE.Material,
    readonly capacity: number,
    opts: { cast?: boolean; receive?: boolean; dynamic?: boolean; name?: string; geometry?: THREE.BufferGeometry } = {},
  ) {
    this.mesh = new THREE.InstancedMesh(opts.geometry ?? UNIT_BOX, material, Math.max(1, capacity));
    this.mesh.name = opts.name ?? "boxes";
    this.mesh.castShadow = opts.cast ?? false;
    this.mesh.receiveShadow = opts.receive ?? false;
    this.mesh.count = 0;
    // Make sure instanceColor exists before the first render so the shader includes it.
    this.mesh.setColorAt(0, tmpC.set(0xffffff));
    if (opts.dynamic) {
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
    }
  }

  get size(): number {
    return this.n;
  }

  begin(): void {
    this.n = 0;
  }

  pushMatrix(m: THREE.Matrix4, color: THREE.Color | number): void {
    if (this.n >= this.capacity) return;
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, typeof color === "number" ? tmpC.set(color) : color);
    this.n++;
  }

  /** Convenience: push a box by centre/size/rotation. */
  box(color: THREE.Color | number, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0, parent?: THREE.Matrix4): void {
    this.pushMatrix(boxMatrix(tmpM, x, y, z, w, h, d, rx, ry, rz, parent), color);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** For static batches: finalise and compute bounds so frustum culling works. */
  seal(): void {
    this.end();
    this.mesh.computeBoundingBox();
    this.mesh.computeBoundingSphere();
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

/** Collects static boxes first so the batch can be allocated at the exact size. */
export class BoxList {
  readonly matrices: THREE.Matrix4[] = [];
  readonly colors: THREE.Color[] = [];

  box(color: THREE.Color | number, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0, parent?: THREE.Matrix4): void {
    this.matrices.push(boxMatrix(new THREE.Matrix4(), x, y, z, w, h, d, rx, ry, rz, parent));
    this.colors.push(typeof color === "number" ? new THREE.Color(color) : color.clone());
  }

  /** A box hanging off a pivot: yaw about y, then pitch about local x, centre pushed `along` the local +z. */
  limb(color: THREE.Color | number, px: number, py: number, pz: number, w: number, h: number, len: number, yaw: number, pitch: number, parent?: THREE.Matrix4): void {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
    const off = new THREE.Vector3(0, 0, len / 2).applyQuaternion(q);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(px + off.x, py + off.y, pz + off.z), q, new THREE.Vector3(w, h, len));
    if (parent) m.premultiply(parent);
    this.matrices.push(m);
    this.colors.push(typeof color === "number" ? new THREE.Color(color) : color.clone());
  }

  get length(): number {
    return this.matrices.length;
  }

  toBatch(material: THREE.Material, opts: { cast?: boolean; receive?: boolean; name?: string }): BoxBatch {
    const b = new BoxBatch(material, this.matrices.length, opts);
    for (let i = 0; i < this.matrices.length; i++) b.pushMatrix(this.matrices[i]!, this.colors[i]!);
    b.seal();
    return b;
  }
}

/** Colour with a little brightness jitter, for that hand-painted voxel look. */
export function jitter(hex: number, rnd: () => number, amount = 0.08): THREE.Color {
  const c = new THREE.Color(hex);
  const k = 1 + (rnd() - 0.5) * 2 * amount;
  return c.multiplyScalar(k);
}
