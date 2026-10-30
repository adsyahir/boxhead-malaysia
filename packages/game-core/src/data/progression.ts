import type { LevelReward, WeaponId } from "../types";
import { WEAPONS } from "./weapons";

/**
 * Team level, driven by team kills. Level 1 needs no kills; each level costs a little more than the last.
 * Level 125 (the last entry of the upgrade list) lands around 2,000 kills, roughly wave 25.
 * Tune the feel here and nowhere else.
 */
export const MAX_LEVEL = 125;
const CURVE = { perLevel: 4, quadratic: 0.1 } as const;

/** Total team kills needed to reach `level`. */
export function killsForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = Math.min(level, MAX_LEVEL) - 1;
  return Math.round(CURVE.perLevel * n + CURVE.quadratic * n * n);
}

export function levelForKills(kills: number): number {
  let level = 1;
  while (level < MAX_LEVEL && kills >= killsForLevel(level + 1)) level++;
  return level;
}

export type UpgradeId =
  | "fastFire"
  | "rapidFire"
  | "doubleDamage"
  | "quadDamage"
  | "doubleAmmo"
  | "quadAmmo"
  | "longShot"
  | "infiniteRange"
  | "wideShot"
  | "widerShot"
  | "bigBang"
  | "biggerBang"
  | "clusterExplode";

const NEW = null;
type Entry = [level: number, weapon: WeaponId, upgrade: UpgradeId | typeof NEW];

/**
 * The upgrade list: what each level gives. "Pistol" is Lastik, "Barrel" is Tong Gas, "Grenade" is Bom Ikan,
 * "Fake wall" is Pagar Buluh, "Claymore" is Mercun Bola, "Rocket" is Meriam Buluh. Chargepack (Bungkusan Bom)
 * and Railgun (Senapang Kilat) are the two extra weapons.
 */
const TABLE: Entry[] = [
  [3, "lastik", "fastFire"],
  [5, "uzi", NEW],
  [8, "lastik", "doubleDamage"],
  [10, "senapangPatah", NEW],
  [13, "uzi", "rapidFire"],
  [15, "tongGas", NEW],
  [17, "uzi", "doubleAmmo"],
  [18, "senapangPatah", "fastFire"],
  [20, "bomIkan", NEW],
  [21, "senapangPatah", "doubleAmmo"],
  [23, "uzi", "longShot"],
  [26, "tongGas", "doubleAmmo"],
  [30, "pagarBuluh", NEW],
  [31, "senapangPatah", "wideShot"],
  [32, "tongGas", "bigBang"],
  [33, "bomIkan", "clusterExplode"],
  [35, "senapangPatah", "longShot"],
  [36, "tongGas", "quadAmmo"],
  [37, "pagarBuluh", "doubleAmmo"],
  [39, "uzi", "quadAmmo"],
  [40, "mercunBola", NEW],
  [41, "senapangPatah", "quadAmmo"],
  [42, "bomIkan", "doubleAmmo"],
  [43, "senapangPatah", "rapidFire"],
  [44, "tongGas", "biggerBang"],
  [45, "bomIkan", "bigBang"],
  [47, "mercunBola", "clusterExplode"],
  [48, "uzi", "doubleDamage"],
  [50, "meriamBuluh", NEW],
  [51, "senapangPatah", "widerShot"],
  [52, "bomIkan", "quadAmmo"],
  [53, "pagarBuluh", "quadAmmo"],
  [54, "mercunBola", "doubleAmmo"],
  [55, "chargepack", NEW],
  [56, "senapangPatah", "doubleDamage"],
  [57, "bomIkan", "biggerBang"],
  [58, "mercunBola", "bigBang"],
  [59, "meriamBuluh", "fastFire"],
  [61, "uzi", "infiniteRange"],
  [62, "mercunBola", "biggerBang"],
  [63, "chargepack", "clusterExplode"],
  [64, "mercunBola", "quadAmmo"],
  [66, "meriamBuluh", "doubleAmmo"],
  [68, "chargepack", "doubleAmmo"],
  [70, "railgun", NEW],
  [72, "meriamBuluh", "bigBang"],
  [74, "chargepack", "bigBang"],
  [76, "chargepack", "quadAmmo"],
  [78, "railgun", "fastFire"],
  [80, "railgun", "doubleAmmo"],
  [85, "meriamBuluh", "quadAmmo"],
  [90, "uzi", "quadDamage"],
  [95, "chargepack", "biggerBang"],
  [100, "railgun", "rapidFire"],
  [105, "meriamBuluh", "biggerBang"],
  [110, "railgun", "quadAmmo"],
  [120, "meriamBuluh", "rapidFire"],
  [125, "railgun", "longShot"],
];

export interface UpgradeListEntry {
  level: number;
  reward: LevelReward;
}

export const UPGRADE_LIST: UpgradeListEntry[] = TABLE.map(([level, weapon, upgrade]) => ({
  level,
  reward: upgrade === NEW ? { kind: "weapon", weapon } : { kind: "upgrade", weapon, upgrade },
}));

const BY_LEVEL = new Map(UPGRADE_LIST.map((e) => [e.level, e.reward]));

export function rewardAt(level: number): LevelReward | null {
  return BY_LEVEL.get(level) ?? null;
}

/** Level at which `weapon` becomes available (from the weapon table, which the list must agree with). */
export function unlockLevel(weapon: WeaponId): number {
  return WEAPONS[weapon].unlockLevel;
}

/** Every upgrade of `weapon` reached at or below `level`. */
export function upgradesFor(weapon: WeaponId, level: number): UpgradeId[] {
  return UPGRADE_LIST.filter((e) => e.level <= level && e.reward.kind === "upgrade" && e.reward.weapon === weapon).map(
    (e) => (e.reward as { upgrade: UpgradeId }).upgrade,
  );
}

/** A weapon's numbers after its upgrades. At level 1 they equal the base table. */
export interface WeaponStats {
  damage: number;
  cooldown: number;
  /** Multiplies every ammo grant (unlock, pickups) for this weapon. */
  ammoMult: number;
  /** Projectile / beam range in px; Infinity = until it hits something. */
  range: number;
  spread: number;
  pellets: number;
  blast: number;
  /** Explosions leave smaller secondary blasts around them. */
  cluster: boolean;
}

export const UPGRADE_EFFECTS = {
  fastFireCooldown: 0.8,
  rapidFireCooldown: 0.6,
  doubleDamage: 2,
  quadDamage: 4,
  doubleAmmo: 2,
  quadAmmo: 4,
  longShotRange: 1.5,
  wideShotSpread: 1.4,
  widerShotSpread: 1.8,
  widerShotExtraPellets: 2,
  bigBang: 1.25,
  biggerBang: 1.5,
} as const;

export function weaponStats(id: WeaponId, level: number): WeaponStats {
  const def = WEAPONS[id];
  const up = new Set(upgradesFor(id, level));
  const E = UPGRADE_EFFECTS;
  // Tiers replace each other (Quad beats Double, Rapid beats Fast): they do not multiply.
  const cooldownMult = up.has("rapidFire") ? E.rapidFireCooldown : up.has("fastFire") ? E.fastFireCooldown : 1;
  const damageMult = up.has("quadDamage") ? E.quadDamage : up.has("doubleDamage") ? E.doubleDamage : 1;
  const ammoMult = up.has("quadAmmo") ? E.quadAmmo : up.has("doubleAmmo") ? E.doubleAmmo : 1;
  const baseRange = def.range ?? 0;
  const range = up.has("infiniteRange") ? Infinity : up.has("longShot") ? baseRange * E.longShotRange : baseRange;
  const spreadMult = up.has("widerShot") ? E.widerShotSpread : up.has("wideShot") ? E.wideShotSpread : 1;
  const blastMult = up.has("biggerBang") ? E.biggerBang : up.has("bigBang") ? E.bigBang : 1;
  return {
    damage: def.damage * damageMult,
    cooldown: def.cooldown * cooldownMult,
    ammoMult,
    range,
    spread: (def.spread ?? 0) * spreadMult,
    pellets: (def.pellets ?? 1) + (up.has("widerShot") ? E.widerShotExtraPellets : 0),
    blast: (def.blast ?? 0) * blastMult,
    cluster: up.has("clusterExplode"),
  };
}
