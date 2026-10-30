/** Seeded mulberry32. State is a plain object so a World stays serialisable. */
export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

export function nextFloat(r: Rng): number {
  r.state = (r.state + 0x6d2b79f5) >>> 0;
  let t = r.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rangeFloat(r: Rng, min: number, max: number): number {
  return min + (max - min) * nextFloat(r);
}

export function nextInt(r: Rng, n: number): number {
  return Math.floor(nextFloat(r) * n);
}

export function shuffle<T>(r: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(r, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
