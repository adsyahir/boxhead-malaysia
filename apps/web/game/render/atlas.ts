import type { EnemyKind, PickupKind, PlaceableKind, ProjectileKind } from "@kampung/game-core";

/**
 * Single lookup between game entities and art. Swapping the placeholder boxes for voxel
 * sprite sheets only changes this file and the atlas that Boot loads.
 * `rotates` = the art has one frame facing +x and is rotated to the facing direction.
 */
export interface SpriteRef {
  key: string;
  frame?: string | number;
  rotates: boolean;
}

export type Animation = "idle" | "walk";
export type Direction8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function playerSprite(playerId: number, _dir: Direction8, _anim: Animation): SpriteRef {
  return { key: playerId === 0 ? "abu" : "siti", rotates: true };
}

export function enemySprite(kind: EnemyKind, _dir: Direction8, _anim: Animation): SpriteRef {
  return { key: kind, rotates: true };
}

export function projectileSprite(kind: ProjectileKind): SpriteRef {
  return { key: kind, rotates: kind === "rocket" };
}

export function placeableSprite(kind: PlaceableKind): SpriteRef {
  return { key: kind, rotates: false };
}

export function pickupSprite(kind: PickupKind): SpriteRef {
  return { key: kind, rotates: false };
}
