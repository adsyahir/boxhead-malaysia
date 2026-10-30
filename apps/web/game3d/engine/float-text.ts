import * as THREE from "three";

interface Item {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  age: number;
}

const LIFE = 0.8;
const v = new THREE.Vector3();

/** Floating "+100 x3" labels as pooled DOM nodes projected from world space. Crisp at any DPR. */
export class FloatText {
  private readonly items: Item[] = [];
  private readonly pool: HTMLDivElement[] = [];

  constructor(private readonly layer: HTMLElement) {}

  add(x: number, y: number, z: number, text: string, color: string): void {
    const el = this.pool.pop() ?? document.createElement("div");
    el.className = "g3d-float";
    el.textContent = text;
    el.style.color = color;
    el.style.opacity = "1";
    this.layer.appendChild(el);
    this.items.push({ el, pos: new THREE.Vector3(x, y, z), age: 0 });
    if (this.items.length > 40) this.recycle(0);
  }

  private recycle(i: number): void {
    const it = this.items[i]!;
    it.el.remove();
    this.pool.push(it.el);
    this.items.splice(i, 1);
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      it.age += dt;
      if (it.age >= LIFE) {
        this.recycle(i);
        continue;
      }
      v.copy(it.pos);
      v.y += it.age * 1.1;
      v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      it.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
      it.el.style.opacity = String(Math.min(1, (LIFE - it.age) / 0.35));
    }
  }

  clear(): void {
    while (this.items.length) this.recycle(this.items.length - 1);
  }

  dispose(): void {
    this.clear();
    this.pool.length = 0;
  }
}
