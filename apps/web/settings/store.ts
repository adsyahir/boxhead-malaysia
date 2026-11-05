/** Player settings, persisted in localStorage. Framework-free so the engine, audio and React can all use it. */
export type Lang = "ms" | "en";
export type Quality = "high" | "low";

export interface Settings {
  lang: Lang;
  /** 0 to 1 */
  volume: number;
  muted: boolean;
  quality: Quality;
  /** Performance display: FPS and frame time, plus ping and network numbers when online. */
  perf: boolean;
  /** Aim assist. A run that used it cannot go on the leaderboard. */
  aimAssist: boolean;
}

export const DEFAULT_SETTINGS: Settings = { lang: "ms", volume: 0.8, muted: false, quality: "high", perf: false, aimAssist: false };

const KEY = "kpp-settings";
const LEGACY_MUTE_KEY = "kpp-mute";

let state: Settings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function clean(raw: unknown): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (r.lang === "ms" || r.lang === "en") out.lang = r.lang;
  if (typeof r.volume === "number" && Number.isFinite(r.volume)) out.volume = Math.min(1, Math.max(0, r.volume));
  if (typeof r.muted === "boolean") out.muted = r.muted;
  if (r.quality === "high" || r.quality === "low") out.quality = r.quality;
  if (typeof r.perf === "boolean") out.perf = r.perf;
  if (typeof r.aimAssist === "boolean") out.aimAssist = r.aimAssist;
  return out;
}

function load(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULT_SETTINGS, ...clean(JSON.parse(raw)) };
    else if (window.localStorage.getItem(LEGACY_MUTE_KEY) === "1") state = { ...DEFAULT_SETTINGS, muted: true };
  } catch {
    /* storage blocked or corrupt: fall back to defaults */
  }
  applyLangAttr();
}

function applyLangAttr(): void {
  if (typeof document !== "undefined") document.documentElement.lang = state.lang;
}

/** Stable object identity between updates, so it works as a useSyncExternalStore snapshot. */
export function getSettings(): Settings {
  load();
  return state;
}

export function updateSettings(patch: Partial<Settings>): void {
  load();
  const next = { ...state, ...clean(patch) };
  if ((Object.keys(next) as (keyof Settings)[]).every((k) => next[k] === state[k])) return;
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* settings just won't persist */
  }
  applyLangAttr();
  listeners.forEach((fn) => fn());
}

export function resetSettings(): void {
  updateSettings({ ...DEFAULT_SETTINGS });
}

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
