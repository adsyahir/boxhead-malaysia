"use client";

import { updateSettings, type Lang } from "../../settings/store";
import { useSettings } from "../../settings/react";

const OPTIONS: { lang: Lang; label: string; name: string }[] = [
  { lang: "ms", label: "BM", name: "Bahasa Melayu" },
  { lang: "en", label: "EN", name: "English" },
];

/** Compact Malay / English switch, used on the main menu and the plain pages. */
export default function LangSwitch({ className = "" }: { className?: string }) {
  const { lang } = useSettings();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label="Language / Bahasa">
      {OPTIONS.map((o) => (
        <button
          type="button"
          key={o.lang}
          className={lang === o.lang ? "on" : ""}
          aria-pressed={lang === o.lang}
          title={o.name}
          aria-label={o.name}
          onClick={() => updateSettings({ lang: o.lang })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
