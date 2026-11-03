import { describe, expect, it } from "vitest";
import { maxScore, maxScoreForKills, totalSpawned, validateNickname, validateRun } from "../src";

const good = { score: 5000, wave: 3, kills: 30, durationMs: 90_000 };

describe("validateRun", () => {
  it("accepts a plausible run", () => {
    expect(validateRun(good)).toEqual({ ok: true });
  });

  it("maxScore sums every wave at x30 combo", () => {
    // wave 1: 8 pocong * 100 * 30
    expect(maxScore(1)).toBe(24_000);
    // wave 2 adds 11*100 + 3*80 = 1340 * 30
    expect(maxScore(2)).toBe(24_000 + 1340 * 30);
  });

  it("totalSpawned counts enemies of waves 1..n", () => {
    expect(totalSpawned(1)).toBe(8);
    expect(totalSpawned(2)).toBe(8 + 14);
    expect(totalSpawned(3)).toBe(8 + 14 + 20);
  });

  it.each([
    ["score above max", { ...good, score: maxScore(3) + 1 }],
    ["duration too short", { ...good, durationMs: 29_999 }],
    ["more kills than spawned", { ...good, kills: totalSpawned(3) + 1 }],
    ["wave zero", { ...good, wave: 0 }],
    ["negative score", { ...good, score: -1 }],
    ["fractional kills", { ...good, kills: 1.5 }],
    ["NaN", { ...good, score: NaN }],
  ])("rejects %s", (_n, run) => {
    expect(validateRun(run).ok).toBe(false);
  });

  it("accepts boundary values, and nothing past them", () => {
    const top = maxScoreForKills(totalSpawned(3), 3);
    expect(validateRun({ score: top, wave: 3, kills: totalSpawned(3), durationMs: 30_000 }).ok).toBe(true);
    expect(validateRun({ score: top + 10, wave: 3, kills: totalSpawned(3), durationMs: 30_000 }).ok).toBe(false);
    expect(validateRun({ score: top, wave: 3, kills: totalSpawned(3), durationMs: 29_999 }).ok).toBe(false);
  });
});

describe("validateNickname", () => {
  it.each(["Abu", "Siti_99", "Pak Cik-Ali", "a".repeat(16)])("accepts %s", (n) => {
    expect(validateNickname(n)).toEqual({ ok: true });
  });

  it.each(["ab", "a".repeat(17), "emoji😀name", "semi;colon", " lead", "trail ", "<script>"])("rejects shape %j", (n) => {
    expect(validateNickname(n).ok).toBe(false);
  });

  it.each(["Babi123", "f_u_c_k", "S1AL", "xxBodohxx", "sh1t"])("rejects bad word %s", (n) => {
    expect(validateNickname(n).ok).toBe(false);
  });

  it.each(["kote", "Kote Besar", "k0t3", "KOTEK", "Pukimak", "pepek", "butoh", "lancau", "cibai", "Lanjiao", "haram jadah", "kepala bapak"])(
    "rejects Malay / local vulgar word %s",
    (n) => {
      expect(validateNickname(n).ok).toBe(false);
    },
  );

  it.each(["fuck", "FUCK you", "fuuuck", "f-u-c-k", "fck", "Bitch", "b1tch", "cunt", "pussy", "5hit", "a55hole", "nigga"])(
    "rejects English vulgar word %s",
    (n) => {
      expect(validateNickname(n).ok).toBe(false);
    },
  );

  it.each(["Nazir", "Nazim", "Grape", "Ashraf", "Hakim", "Kimi", "Ah Meng", "Muthu", "Kavitha", "Pak Cik Hamid", "Mak Cik Kiah", "Shahrul", "Assassin", "Puteri", "Kotaraya"])(
    "still accepts the ordinary name %s",
    (n) => {
      expect(validateNickname(n)).toEqual({ ok: true });
    },
  );
});
