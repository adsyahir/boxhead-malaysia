import type { WeaponId } from "../types";

export type WeaponKind = "bullet" | "pellets" | "barricade" | "barrel" | "grenade" | "mine" | "rocket";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kind: WeaponKind;
  damage: number;
  cooldown: number;
  /** Ammo granted on unlock. Infinity = unlimited. */
  startAmmo: number;
  unlockScore: number;
  spread?: number;
  pellets?: number;
  speed?: number;
  /** Projectile travel distance (px). */
  range?: number;
  /** Explosion radius. */
  blast?: number;
  fuse?: number;
  arm?: number;
  hp?: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  lastik: { id: "lastik", name: "Lastik", kind: "bullet", damage: 26, cooldown: 0.3, startAmmo: Infinity, unlockScore: 0, speed: 520, range: 600 },
  uzi: { id: "uzi", name: "Uzi", kind: "bullet", damage: 13, cooldown: 0.08, startAmmo: 140, unlockScore: 1500, spread: 0.12, speed: 560, range: 600 },
  senapangPatah: { id: "senapangPatah", name: "Senapang Patah", kind: "pellets", damage: 17, cooldown: 0.65, startAmmo: 30, unlockScore: 5000, spread: 0.24, pellets: 7, speed: 520, range: 180 },
  pagarBuluh: { id: "pagarBuluh", name: "Pagar Buluh", kind: "barricade", damage: 0, cooldown: 0.5, startAmmo: 6, unlockScore: 8000, hp: 150 },
  tongGas: { id: "tongGas", name: "Tong Gas", kind: "barrel", damage: 150, cooldown: 0.4, startAmmo: 8, unlockScore: 10000, blast: 95, hp: 1 },
  bomIkan: { id: "bomIkan", name: "Bom Ikan", kind: "grenade", damage: 120, cooldown: 0.8, startAmmo: 10, unlockScore: 13000, blast: 80, fuse: 1.0, speed: 300 },
  mercunBola: { id: "mercunBola", name: "Mercun Bola", kind: "mine", damage: 130, cooldown: 0.35, startAmmo: 8, unlockScore: 16000, blast: 85, arm: 0.6 },
  meriamBuluh: { id: "meriamBuluh", name: "Meriam Buluh", kind: "rocket", damage: 160, cooldown: 1.1, startAmmo: 12, unlockScore: 25000, blast: 90, speed: 360, range: 900 },
};

/** Placeable stats that are not part of the weapon table. */
export const PLACEABLE = {
  barricadeRadius: 14,
  barrelRadius: 12,
  mineRadius: 8,
  mineTriggerPadding: 6,
  placeDistance: 30,
} as const;
