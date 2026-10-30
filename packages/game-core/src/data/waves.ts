import type { EnemyKind } from "../types";
import { ENEMIES } from "./enemies";

export interface WaveComposition {
  pocong: number;
  toyol: number;
  pontianak: number;
}

export function waveComposition(wave: number): WaveComposition {
  return {
    pocong: 5 + 3 * wave,
    toyol: wave >= 2 ? 2 * wave - 1 : 0,
    pontianak: wave >= 3 ? Math.floor((wave - 1) / 2) : 0,
  };
}

export function spawnInterval(wave: number): number {
  return Math.max(0.22, 1.1 - 0.07 * wave);
}

export function waveEnemyCount(wave: number): number {
  const c = waveComposition(wave);
  return c.pocong + c.toyol + c.pontianak;
}

export function waveQueue(wave: number): EnemyKind[] {
  const c = waveComposition(wave);
  return [
    ...new Array<EnemyKind>(c.pocong).fill("pocong"),
    ...new Array<EnemyKind>(c.toyol).fill("toyol"),
    ...new Array<EnemyKind>(c.pontianak).fill("pontianak"),
  ];
}

export function wavePoints(wave: number): number {
  const c = waveComposition(wave);
  return (
    c.pocong * ENEMIES.pocong.points + c.toyol * ENEMIES.toyol.points + c.pontianak * ENEMIES.pontianak.points
  );
}
