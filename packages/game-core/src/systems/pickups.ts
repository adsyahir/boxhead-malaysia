import { BALANCE } from "../data/balance";
import { WEAPONS } from "../data/weapons";
import { nextInt } from "../rng";
import type { GameEvent, PickupKind, World } from "../types";
import { addScore } from "./combat";

export function spawnPickup(w: World, kind: PickupKind, x: number, y: number): void {
  w.pickups.push({
    id: w.nextId++,
    kind,
    x,
    y,
    age: 0,
    ttl: kind === "crate" ? BALANCE.crateTtl : BALANCE.pickupTtl,
  });
}

export function updatePickups(w: World, dt: number, ev: GameEvent[]): void {
  const keep = [];
  for (const pk of w.pickups) {
    pk.age += dt;
    if (pk.age >= pk.ttl) continue;
    const taker = w.players.find((p) => p.alive && Math.hypot(p.x - pk.x, p.y - pk.y) <= BALANCE.pickupRadius + p.radius);
    if (!taker) {
      keep.push(pk);
      continue;
    }
    ev.push({ type: "pickup", kind: pk.kind, playerId: taker.id });
    if (pk.kind === "ketupat") {
      taker.hp = Math.min(taker.maxHp, taker.hp + BALANCE.ketupatHeal);
      continue;
    }
    const options = w.unlocked.filter((id) => id !== "lastik");
    if (options.length === 0) {
      addScore(w, BALANCE.ammoFallbackScore, ev);
      continue;
    }
    const id = options[nextInt(w.rng, options.length)]!;
    taker.ammo[id] += Math.round(WEAPONS[id].startAmmo * BALANCE.ammoBoxFraction);
  }
  w.pickups = keep;
}
