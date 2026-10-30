import type { SampledInput } from "./key-state";

/** Framework-free touch state, written by on-screen controls (Phaser Hud or the 3D DOM overlay). */
export const touchState = { moveX: 0, moveY: 0, fire: false, swapHeld: false, swapTapped: false };

export function resetTouchState(): void {
  Object.assign(touchState, { moveX: 0, moveY: 0, fire: false, swapHeld: false, swapTapped: false });
}

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse && (navigator.maxTouchPoints > 0 || "ontouchstart" in window);
}

export function sampleTouch(): SampledInput {
  const tapped = touchState.swapTapped;
  touchState.swapTapped = false;
  return {
    inputs: [{ moveX: touchState.moveX, moveY: touchState.moveY, fire: touchState.fire, switchWeapon: touchState.swapHeld }],
    swapTapped: [tapped],
  };
}

export const STICK_RADIUS = 56;
const DEAD_ZONE = 10;

/** Clamp a drag vector to the stick radius and write the normalised move into touchState. */
export function applyStick(dx: number, dy: number): { dx: number; dy: number } {
  const len = Math.hypot(dx, dy);
  if (len > STICK_RADIUS) {
    dx = (dx / len) * STICK_RADIUS;
    dy = (dy / len) * STICK_RADIUS;
  }
  const dead = Math.hypot(dx, dy) < DEAD_ZONE;
  touchState.moveX = dead ? 0 : dx / STICK_RADIUS;
  touchState.moveY = dead ? 0 : dy / STICK_RADIUS;
  return { dx, dy };
}
