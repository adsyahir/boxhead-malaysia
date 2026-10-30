import { ENEMIES } from "./data/enemies";
import { waveComposition, waveEnemyCount } from "./data/waves";

export interface RunSummary {
  score: number;
  wave: number;
  kills: number;
  durationMs: number;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export const MAX_COMBO_FACTOR = 30;
export const MIN_MS_PER_WAVE = 10_000;

/** Upper bound on score reachable by the end of `wave`: every enemy killed at max combo. */
export function maxScore(wave: number): number {
  let total = 0;
  for (let w = 1; w <= wave; w++) {
    const c = waveComposition(w);
    total +=
      (c.pocong * ENEMIES.pocong.points + c.toyol * ENEMIES.toyol.points + c.pontianak * ENEMIES.pontianak.points) *
      MAX_COMBO_FACTOR;
  }
  return total;
}

export function totalSpawned(wave: number): number {
  let total = 0;
  for (let w = 1; w <= wave; w++) total += waveEnemyCount(w);
  return total;
}

export function validateRun(run: RunSummary): ValidationResult {
  const { score, wave, kills, durationMs } = run;
  if (![score, wave, kills, durationMs].every(Number.isInteger)) return { ok: false, reason: "Numbers must be whole" };
  if (score < 0 || kills < 0 || durationMs < 0) return { ok: false, reason: "Negative values" };
  if (wave < 1) return { ok: false, reason: "Wave must be at least 1" };
  if (score > maxScore(wave)) return { ok: false, reason: "Score too high for wave" };
  if (durationMs < wave * MIN_MS_PER_WAVE) return { ok: false, reason: "Run too short for wave" };
  if (kills > totalSpawned(wave)) return { ok: false, reason: "More kills than enemies spawned" };
  return { ok: true };
}

const BAD_WORDS = [
  "babi", "sial", "bodoh", "puki", "pukimak", "celaka", "anjing", "lancau", "pantat", "kimak", "bangsat", "keparat",
  "fuck", "shit", "bitch", "cunt", "dick", "asshole", "bastard", "nigger", "nigga", "faggot", "whore",
];

const NICK_RE = /^[A-Za-z0-9 _-]{3,16}$/;

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s");
}

export function validateNickname(nickname: string): ValidationResult {
  const n = nickname.trim();
  if (n !== nickname) return { ok: false, reason: "No leading or trailing spaces" };
  if (!NICK_RE.test(n)) return { ok: false, reason: "Nickname must be 3 to 16 letters, numbers, spaces, _ or -" };
  const flat = normalise(n);
  if (BAD_WORDS.some((b) => flat.includes(b))) return { ok: false, reason: "Nickname not allowed" };
  return { ok: true };
}
