import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MouseAim, aimToward } from "./mouse-aim";

// Node has no window; MouseAim only adds release listeners to it.
(globalThis as { window?: unknown }).window ??= { addEventListener: () => {}, removeEventListener: () => {} };

/** A stand-in for the canvas: 800x400 at the page origin, with listeners we can call. */
function fakeCanvas() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const el = {
    style: { cursor: "" },
    addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h),
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
  };
  return { el: el as unknown as HTMLElement, fire: (t: string, e: object) => handlers[t]!(e) };
}

describe("aimToward", () => {
  it("points from the hero to the target as a unit vector", () => {
    expect(aimToward(100, 100, 100, 50)).toEqual({ x: 0, y: -1 });
    const d = aimToward(0, 0, 30, 40)!;
    expect(d.x).toBeCloseTo(0.6);
    expect(d.y).toBeCloseTo(0.8);
  });

  it("gives no aim when the cursor is on the hero", () => {
    expect(aimToward(100, 100, 101, 102)).toBeNull();
  });
});

describe("MouseAim", () => {
  // Camera straight above world point (320 px, 320 px) = scene (10, 10), looking down with world -y (scene -z) up.
  const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
  camera.position.set(10, 20, 10);
  camera.up.set(0, 0, -1);
  camera.lookAt(10, 0, 10);
  camera.updateMatrixWorld();

  it("is off until the mouse moves, so keyboard players keep walking-direction facing", () => {
    const c = fakeCanvas();
    const m = new MouseAim(c.el);
    expect(m.aim(camera, 320, 320)).toBeNull();
    c.fire("pointermove", { pointerType: "touch", clientX: 700, clientY: 200 });
    expect(m.active).toBe(false);
  });

  it("aims at the ground under the cursor", () => {
    const c = fakeCanvas();
    const m = new MouseAim(c.el);
    c.fire("pointermove", { pointerType: "mouse", clientX: 700, clientY: 200 }); // right of centre
    expect(m.active).toBe(true);
    expect(c.el.style.cursor).toBe("crosshair");
    const right = m.aim(camera, 320, 320)!;
    expect(right.x).toBeCloseTo(1, 5);
    expect(right.y).toBeCloseTo(0, 5);
    c.fire("pointermove", { pointerType: "mouse", clientX: 400, clientY: 20 }); // above centre = world -y
    const up = m.aim(camera, 320, 320)!;
    expect(up.x).toBeCloseTo(0, 5);
    expect(up.y).toBeCloseTo(-1, 5);
  });

  it("left button fires and releases", () => {
    const c = fakeCanvas();
    const m = new MouseAim(c.el);
    c.fire("pointerdown", { pointerType: "mouse", button: 2, clientX: 1, clientY: 1 });
    expect(m.fire).toBe(false);
    c.fire("pointerdown", { pointerType: "mouse", button: 0, clientX: 1, clientY: 1 });
    expect(m.fire).toBe(true);
  });
});
