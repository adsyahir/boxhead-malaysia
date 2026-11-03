import * as THREE from "three";
import { PX } from "./coords";

/**
 * Desktop mouse aim: the hero faces the point on the ground under the cursor, and the left button fires.
 * It switches on the first time the mouse moves over the game, so a keyboard-only player keeps Boxhead-style
 * facing (the way you walk). Only the local hero uses it; there is one, since local 2P was removed.
 */
export class MouseAim {
  /** True once the mouse has moved over the game this run. */
  active = false;
  fire = false;
  private clientX = 0;
  private clientY = 0;
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private readonly el: HTMLElement) {
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("blur", this.onUp);
    el.addEventListener("contextmenu", this.onContext);
  }

  destroy(): void {
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("blur", this.onUp);
    this.el.removeEventListener("contextmenu", this.onContext);
    this.el.style.cursor = "";
  }

  /** Unit aim from the hero (world px) towards the ground under the cursor, or null when the mouse is not in use. */
  aim(camera: THREE.Camera, heroX: number, heroY: number): { x: number; y: number } | null {
    if (!this.active) return null;
    const r = this.el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    this.ndc.set(((this.clientX - r.left) / r.width) * 2 - 1, -((this.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, camera);
    if (!this.ray.ray.intersectPlane(this.ground, this.hit)) return null;
    return aimToward(heroX, heroY, this.hit.x / PX, this.hit.z / PX);
  }

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse") return;
    this.clientX = e.clientX;
    this.clientY = e.clientY;
    if (!this.active) {
      this.active = true;
      this.el.style.cursor = "crosshair";
    }
  };

  private readonly onDown = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    this.onMove(e);
    this.fire = true;
  };

  private readonly onUp = (): void => {
    this.fire = false;
  };

  private readonly onContext = (e: Event): void => e.preventDefault();
}

/** Unit vector from the hero to a target point (both world px); null when the cursor is on the hero itself. */
export function aimToward(heroX: number, heroY: number, targetX: number, targetY: number): { x: number; y: number } | null {
  const dx = targetX - heroX;
  const dy = targetY - heroY;
  const d = Math.hypot(dx, dy);
  if (d < 4) return null;
  return { x: dx / d, y: dy / d };
}
