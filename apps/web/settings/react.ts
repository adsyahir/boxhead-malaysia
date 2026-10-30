"use client";

import { useCallback, useSyncExternalStore } from "react";
import { t as translate, type Key, type Vars } from "../i18n";
import { DEFAULT_SETTINGS, getSettings, subscribeSettings, type Settings } from "./store";

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, () => DEFAULT_SETTINGS);
}

/** Translator bound to the current language; components re-render when the language changes. */
export function useT(): (key: Key, vars?: Vars) => string {
  const { lang } = useSettings();
  return useCallback((key: Key, vars?: Vars) => translate(key, vars, lang), [lang]);
}
