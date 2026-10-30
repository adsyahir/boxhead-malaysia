import { describe, expect, it } from "vitest";
import { UPGRADE_NAMES, WEAPON_NAMES, en, ms } from "./strings";

describe("translations", () => {
  it("English and Malay have exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ms).sort());
  });

  it("no string is empty, and none uses an em dash", () => {
    for (const [lang, dict] of [["ms", ms], ["en", en]] as const) {
      for (const [k, v] of Object.entries(dict)) {
        expect(v.trim().length, `${lang}.${k} is empty`).toBeGreaterThan(0);
        expect(v, `${lang}.${k} has an em dash`).not.toContain("—");
      }
    }
  });

  it("placeholders match between languages", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const k of Object.keys(ms) as (keyof typeof ms)[]) expect(vars(en[k]), `placeholders in ${k}`).toBe(vars(ms[k]));
  });

  it("every weapon and upgrade has a name in both languages", () => {
    expect(Object.keys(WEAPON_NAMES.ms).sort()).toEqual(Object.keys(WEAPON_NAMES.en).sort());
    expect(Object.keys(UPGRADE_NAMES.ms).sort()).toEqual(Object.keys(UPGRADE_NAMES.en).sort());
    expect(Object.keys(WEAPON_NAMES.ms)).toHaveLength(10);
    expect(Object.keys(UPGRADE_NAMES.ms)).toHaveLength(13);
  });
});
