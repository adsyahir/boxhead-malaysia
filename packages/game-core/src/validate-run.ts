import { BALANCE } from "./data/balance";
import { ENEMIES } from "./data/enemies";
import { waveComposition, waveEnemyCount } from "./data/waves";

export interface RunSummary {
  score: number;
  wave: number;
  kills: number;
  durationMs: number;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export const MAX_COMBO_FACTOR = BALANCE.comboMax;
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

const POINTS = [ENEMIES.pocong.points, ENEMIES.toyol.points, ENEMIES.pontianak.points];
const MIN_POINTS = Math.min(...POINTS);

/**
 * Highest score `kills` kills can give by the end of `wave`: the most valuable ghosts that wave could have spawned
 * (pontianak are rare), each paired with the highest combo possible (it climbs by one per kill up to comboMax), plus
 * an ammo-box bonus per kill (a box can only drop from a ghost).
 */
export function maxScoreForKills(kills: number, wave: number): number {
  let pontianak = 0;
  let pocong = 0;
  let toyol = 0;
  for (let w = 1; w <= wave; w++) {
    const c = waveComposition(w);
    pontianak += c.pontianak;
    pocong += c.pocong;
    toyol += c.toyol;
  }
  // Points of the kills, best first; combos of the kills, best first (rearrangement: big with big is the maximum).
  const best = [
    [ENEMIES.pontianak.points, pontianak],
    [ENEMIES.pocong.points, pocong],
    [ENEMIES.toyol.points, toyol],
  ].sort((a, b) => b[0]! - a[0]!);
  let total = 0;
  let left = kills;
  let i = 0; // index into the kills, best combo first
  const comboAt = (n: number) => Math.min(BALANCE.comboMax, kills - n); // combos sorted high to low
  for (const [points, count] of best) {
    const take = Math.min(left, count!);
    for (let j = 0; j < take; j++) total += points! * comboAt(i++);
    left -= take;
  }
  return total + BALANCE.ammoFallbackScore * kills;
}

/** Every score is made of kill points times a whole combo, plus 250-point ammo bonuses: always a multiple of this. */
const SCORE_STEP = [...POINTS, BALANCE.ammoFallbackScore].reduce((a, b) => {
  while (b) [a, b] = [b, a % b];
  return a;
});

/**
 * Checks a finished run against the game's own rules, so numbers edited in transit (for example with an
 * intercepting proxy) have to stay consistent with each other. Score, wave and kills are tied together: a wave is
 * only reached after every ghost of the earlier waves is dead, and each point comes from a kill.
 */
export function validateRun(run: RunSummary): ValidationResult {
  const { score, wave, kills, durationMs } = run;
  if (![score, wave, kills, durationMs].every(Number.isInteger)) return { ok: false, reason: "Numbers must be whole" };
  if (score < 0 || kills < 0 || durationMs < 0) return { ok: false, reason: "Negative values" };
  if (wave < 1) return { ok: false, reason: "Wave must be at least 1" };
  if (score > maxScore(wave)) return { ok: false, reason: "Score too high for wave" };
  if (durationMs < wave * MIN_MS_PER_WAVE) return { ok: false, reason: "Run too short for wave" };
  if (kills > totalSpawned(wave)) return { ok: false, reason: "More kills than enemies spawned" };
  if (kills < totalSpawned(wave - 1)) return { ok: false, reason: "Too few kills to reach this wave" };
  if (score % SCORE_STEP !== 0) return { ok: false, reason: "Score is not a possible total" };
  if (score < kills * MIN_POINTS) return { ok: false, reason: "Score too low for kills" };
  if (score > maxScoreForKills(kills, wave)) return { ok: false, reason: "Score too high for kills" };
  return { ok: true };
}

/**
 * Words a nickname may not contain (Malay, Manglish/Hokkien and English). Matched inside the whole name after
 * normalise(), so "Kote Besar", "k0t3" and "fuuuck" are all caught. Very short words (like "cb") are left out on
 * purpose, and so are words hidden inside common names (e.g. "nazi" in Nazir, "rape" in Grape).
 */
const BAD_WORDS = [
  // Malay
  "babi", "sial", "bodoh", "bangang", "puki", "pukimak", "kimak", "celaka", "anjing", "lancau", "pantat", "bangsat",
  "keparat", "kote", "kotek", "konek", "butoh", "pepek", "cipap", "burit", "jubur", "tetek", "pundek", "haramjadah",
  "lahanat", "sundal", "jalang", "pelacur", "kepalabapak",
  // Hokkien / Cantonese used in Malaysia
  "lanjiao", "cibai", "chibai", "nabei", "kanina", "kannina",
  // English
  "fuck", "fck", "fuk", "shit", "bitch", "cunt", "dick", "cock", "pussy", "penis", "vagina", "asshole", "bastard",
  "slut", "whore", "porn", "wank", "twat", "boobs", "tits", "retard", "nigger", "nigga", "faggot",
];

/** Leetspeak to letters, and spaces/underscores/dashes removed, so the name is checked as one word. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/9/g, "g");
}

/** Repeated letters squashed to one ("fuuuck" -> "fuck"). */
const squash = (s: string): string => s.replace(/(.)\1+/g, "$1");

/** True when the name contains a blocked word. Words spelt with a double letter are matched exactly, the rest also after squashing. */
export function hasBadWord(name: string): boolean {
  const flat = normalise(name);
  const flatSquashed = squash(flat);
  return BAD_WORDS.some((w) => flat.includes(w) || (squash(w) === w && flatSquashed.includes(w)));
}

const NICK_RE = /^[A-Za-z0-9 _-]{3,16}$/;

export function validateNickname(nickname: string): ValidationResult {
  const n = nickname.trim();
  if (n !== nickname) return { ok: false, reason: "No leading or trailing spaces" };
  if (!NICK_RE.test(n)) return { ok: false, reason: "Nickname must be 3 to 16 letters, numbers, spaces, _ or -" };
  if (hasBadWord(n)) return { ok: false, reason: "Nickname not allowed" };
  return { ok: true };
}
