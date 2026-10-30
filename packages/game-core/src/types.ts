import type { MapData } from "./map/map-data";
import type { Rng } from "./rng";

export interface Vec {
  x: number;
  y: number;
}

export type PlayerInput = { moveX: number; moveY: number; fire: boolean; switchWeapon: boolean };

export const WEAPON_IDS = [
  "lastik",
  "uzi",
  "senapangPatah",
  "pagarBuluh",
  "tongGas",
  "bomIkan",
  "mercunBola",
  "meriamBuluh",
] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export type EnemyKind = "pocong" | "toyol" | "pontianak";

export interface Player {
  id: number;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  facing: Vec;
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  cooldown: number;
  prevSwitch: boolean;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  points: number;
  /** Seconds left of the rise animation; enemy cannot be hit or act while > 0. */
  rise: number;
  attackCd: number;
  fireCd: number;
  hop: number;
  kx: number;
  ky: number;
}

export type ProjectileKind = "bullet" | "pellet" | "rocket" | "fireball" | "grenade";

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  /** Seconds left; <= 0 means remove. For grenades this is the fuse. */
  life: number;
  blast: number;
}

export type PlaceableKind = "barricade" | "barrel" | "mine";

export interface Placeable {
  id: number;
  kind: PlaceableKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  /** Mine arming countdown. */
  arm: number;
  /** Barrel detonation countdown; < 0 means not triggered. */
  fuse: number;
}

export type PickupKind = "ammo" | "ketupat" | "crate";

export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  age: number;
  ttl: number;
}

export type GameEvent =
  | { type: "shotFired"; weapon: WeaponId; playerId: number }
  | { type: "placed"; kind: PlaceableKind; x: number; y: number }
  | { type: "enemyHit"; id: number }
  | { type: "enemyKilled"; id: number; kind: EnemyKind; x: number; y: number; points: number; combo: number }
  | { type: "explosion"; x: number; y: number; radius: number }
  | { type: "fireball"; x: number; y: number }
  | { type: "pickup"; kind: PickupKind; playerId: number }
  | { type: "waveStarted"; wave: number }
  | { type: "waveCleared"; wave: number }
  | { type: "playerHurt"; id: number }
  | { type: "playerDowned"; id: number }
  | { type: "playerRevived"; id: number }
  | { type: "weaponUnlocked"; weapon: WeaponId }
  | { type: "gameOver"; score: number; wave: number; kills: number; durationMs: number };

export interface FlowField {
  dist: Int32Array;
  timer: number;
  dirty: boolean;
}

export interface World {
  map: MapData;
  rng: Rng;
  time: number;
  tick: number;
  nextId: number;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  placeables: Placeable[];
  pickups: Pickup[];
  unlocked: WeaponId[];
  score: number;
  kills: number;
  combo: number;
  lastKillTime: number;
  wave: number;
  phase: "break" | "wave";
  breakTimer: number;
  queue: EnemyKind[];
  spawnTimer: number;
  spawnedTotal: number;
  flow: FlowField;
  over: boolean;
}
