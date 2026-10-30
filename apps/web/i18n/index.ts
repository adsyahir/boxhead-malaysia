import type { WeaponId } from "@kampung/game-core";
import { getSettings, type Lang } from "../settings/store";
import { WEAPON_NAMES, en, ms, type Key } from "./strings";

export type { Key } from "./strings";
export type Vars = Record<string, string | number>;

const DICT: Record<Lang, Record<Key, string>> = { ms, en };

/** Translate a key. `lang` defaults to the saved language, so non-React code can call it directly. */
export function t(key: Key, vars?: Vars, lang: Lang = getSettings().lang): string {
  let s = DICT[lang][key] ?? ms[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function weaponName(id: WeaponId, lang: Lang = getSettings().lang): string {
  return WEAPON_NAMES[lang][id];
}
