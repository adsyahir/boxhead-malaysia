import type { WeaponId } from "../types";

export type WeaponKind = "bullet" | "pellets" | "barricade" | "barrel" | "grenade" | "mine" | "rocket" | "charge" | "beam";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: WeaponKind;
  damage: number;
  cooldown: number;
  /** Ammo granted on unlock. Infinity = unlimited. */
  startAmmo: number;
  /** Team level that unlocks this weapon (see data/progression.ts). */
  unlockLevel: number;
  spread?: number;
  pellets?: number;
  speed?: number;
  /** Projectile or beam travel distance (px). */
  range?: number;
  /** Explosion radius. */
  blast?: number;
  fuse?: number;
  arm?: number;
  hp?: number;
}

/** Declared in key order: 1, 2, 3 ... 9, 0 select these weapons directly. */
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  lastik: { id: "lastik", name: "Lastik", kind: "bullet", damage: 26, cooldown: 0.3, startAmmo: Infinity, unlockLevel: 1, speed: 520, range: 600 },
  uzi: { id: "uzi", name: "Uzi", kind: "bullet", damage: 13, cooldown: 0.08, startAmmo: 140, unlockLevel: 5, spread: 0.12, speed: 560, range: 600 },
  senapangPatah: { id: "senapangPatah", name: "Senapang Patah", kind: "pellets", damage: 17, cooldown: 0.65, startAmmo: 30, unlockLevel: 10, spread: 0.24, pellets: 7, speed: 520, range: 180 },
  tongGas: { id: "tongGas", name: "Tong Gas", kind: "barrel", damage: 150, cooldown: 0.4, startAmmo: 8, unlockLevel: 15, blast: 95, hp: 1 },
  bomIkan: { id: "bomIkan", name: "Bom Ikan", kind: "grenade", damage: 120, cooldown: 0.8, startAmmo: 10, unlockLevel: 20, blast: 80, fuse: 1.0, speed: 300 },
  pagarBuluh: { id: "pagarBuluh", name: "Pagar Buluh", kind: "barricade", damage: 0, cooldown: 0.5, startAmmo: 6, unlockLevel: 30, hp: 150 },
  mercunBola: { id: "mercunBola", name: "Mercun Bola", kind: "mine", damage: 130, cooldown: 0.35, startAmmo: 8, unlockLevel: 40, blast: 85, arm: 0.6 },
  meriamBuluh: { id: "meriamBuluh", name: "Meriam Buluh", kind: "rocket", damage: 160, cooldown: 1.1, startAmmo: 12, unlockLevel: 50, blast: 90, speed: 360, range: 900 },
  chargepack: { id: "chargepack", name: "Bungkusan Bom", kind: "charge", damage: 220, cooldown: 0.7, startAmmo: 6, unlockLevel: 55, blast: 110, fuse: 2.0, hp: 1 },
  railgun: { id: "railgun", name: "Senapang Kilat", kind: "beam", damage: 120, cooldown: 1.4, startAmmo: 10, unlockLevel: 70, range: 700 },
};

/** Placeable stats that are not part of the weapon table. */
export const PLACEABLE = {
  barricadeRadius: 14,
  barrelRadius: 12,
  mineRadius: 8,
  chargeRadius: 10,
  mineTriggerPadding: 6,
  placeDistance: 30,
} as const;
