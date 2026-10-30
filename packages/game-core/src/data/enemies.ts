import type { EnemyKind } from "../types";

export interface EnemyDef {
  kind: EnemyKind;
  radius: number;
  hp: number;
  speed: number;
  contactDamage: number;
  points: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  pocong: { kind: "pocong", radius: 11, hp: 55, speed: 62, contactDamage: 9, points: 100 },
  toyol: { kind: "toyol", radius: 8, hp: 28, speed: 115, contactDamage: 5, points: 80 },
  pontianak: { kind: "pontianak", radius: 12, hp: 170, speed: 46, contactDamage: 14, points: 400 },
};

export const PONTIANAK = {
  slowRadius: 160,
  slowFactor: 0.5,
  fireRange: 400,
  fireMinCd: 2.2,
  fireMaxCd: 3.2,
  fireballDamage: 12,
  fireballSpeed: 230,
  fireballRadius: 6,
  fireballLife: 2.5,
} as const;

export const POCONG_HOP = { rate: 6, amplitude: 0.8, minFactor: 0.2 } as const;
