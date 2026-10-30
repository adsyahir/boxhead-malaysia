import { PLACEABLE } from "../data/weapons";
import type { GameEvent, World } from "../types";
import { explodeWeapon } from "./combat";

export function updatePlaceables(w: World, dt: number, ev: GameEvent[]): void {
  // Index loop: a barrel explosion can push new fuses onto other barrels mid-pass.
  for (let i = 0; i < w.placeables.length; i++) {
    const b = w.placeables[i]!;
    if (b.hp <= 0) continue;
    if (b.kind === "barrel" && b.fuse >= 0) {
      b.fuse -= dt;
      if (b.fuse <= 0) {
        b.hp = 0;
        explodeWeapon(w, "tongGas", b.x, b.y, ev);
      }
    } else if (b.kind === "charge") {
      // A dropped Bungkusan Bom counts down from the moment it is placed.
      b.fuse -= dt;
      if (b.fuse <= 0) {
        b.hp = 0;
        explodeWeapon(w, "chargepack", b.x, b.y, ev);
      }
    } else if (b.kind === "mine") {
      b.arm = Math.max(0, b.arm - dt);
      if (b.arm > 0) continue;
      const trigger = w.enemies.some(
        (e) => e.hp > 0 && e.rise <= 0 && Math.hypot(e.x - b.x, e.y - b.y) < e.radius + b.radius + PLACEABLE.mineTriggerPadding,
      );
      if (trigger) {
        b.hp = 0;
        explodeWeapon(w, "mercunBola", b.x, b.y, ev);
      }
    }
  }
  const before = w.placeables.length;
  w.placeables = w.placeables.filter((b) => b.hp > 0);
  if (w.placeables.length !== before) w.flow.dirty = true;
}
