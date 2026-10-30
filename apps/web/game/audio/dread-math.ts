/**
 * The numbers behind the "something is getting close" sound. Pure functions so they can be tested;
 * game/audio/dread.ts turns them into actual audio.
 */
export const DREAD = {
  /** Inside this distance (px) fear is at its maximum. */
  nearPx: 60,
  /** Beyond this distance there is no dread at all. */
  farPx: 450,
  /** Enemies closer than this can make their own voice. */
  voicePx: 340,
  /** Enemies within this distance count toward how crowded it feels. */
  crowdPx: 350,
  crowdFull: 8,
  heartSlow: 1.1,
  heartFast: 0.42,
  heartMinIntensity: 0.08,
  voiceMinDelay: 3.5,
  voiceMaxDelay: 8,
  maxVoicesPerWindow: 3,
  voiceWindowSec: 0.6,
} as const;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** 0 when the nearest enemy is far, 1 when it is on top of the hero. Eases in, so it ramps up late and hard. */
export function intensityFor(nearestPx: number): number {
  if (!Number.isFinite(nearestPx)) return 0;
  return Math.pow(clamp01(1 - (nearestPx - DREAD.nearPx) / (DREAD.farPx - DREAD.nearPx)), 1.5);
}

/** 0..1: how many enemies are close, capped. */
export function crowdFor(countClose: number): number {
  return clamp01(countClose / DREAD.crowdFull);
}

/** Seconds between heartbeats: slow when calm, racing when an enemy is right there. */
export function heartbeatInterval(intensity: number): number {
  const i = clamp01(intensity);
  return DREAD.heartSlow + (DREAD.heartFast - DREAD.heartSlow) * i;
}

/** Volume (0..1) of an enemy's voice at a distance. Silent at and beyond voicePx. */
export function voiceGain(distancePx: number): number {
  if (distancePx >= DREAD.voicePx) return 0;
  return Math.pow(1 - Math.max(0, distancePx) / DREAD.voicePx, 1.2);
}

/** Stereo position (-1 left .. 1 right) of an enemy relative to the hero. */
export function panFor(dx: number): number {
  return Math.min(1, Math.max(-1, dx / 300));
}

/** Seconds until an enemy may speak again; `r` is a random number in [0, 1). */
export function nextVoiceDelay(r: number): number {
  return DREAD.voiceMinDelay + clamp01(r) * (DREAD.voiceMaxDelay - DREAD.voiceMinDelay);
}
