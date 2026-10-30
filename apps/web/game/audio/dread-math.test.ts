import { describe, expect, it } from "vitest";
import { DREAD, crowdFor, heartbeatInterval, intensityFor, nextVoiceDelay, panFor, voiceGain } from "./dread-math";

describe("intensityFor", () => {
  it("is silent far away, maximal on top of the hero, and never goes down as the enemy approaches", () => {
    expect(intensityFor(Infinity)).toBe(0);
    expect(intensityFor(DREAD.farPx)).toBe(0);
    expect(intensityFor(DREAD.farPx + 500)).toBe(0);
    expect(intensityFor(DREAD.nearPx)).toBe(1);
    expect(intensityFor(0)).toBe(1);
    let prev = -1;
    for (let d = DREAD.farPx; d >= 0; d -= 10) {
      const i = intensityFor(d);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });

  it("stays low until an enemy is fairly near", () => {
    expect(intensityFor(400)).toBeLessThan(0.1);
    expect(intensityFor(250)).toBeGreaterThan(0.2);
    expect(intensityFor(250)).toBeLessThan(0.7);
  });
});

describe("crowdFor and heartbeatInterval", () => {
  it("crowd grows with enemy count and caps at 1", () => {
    expect(crowdFor(0)).toBe(0);
    expect(crowdFor(4)).toBeCloseTo(0.5);
    expect(crowdFor(50)).toBe(1);
  });

  it("the heart slows when calm and races when an enemy is close", () => {
    expect(heartbeatInterval(0)).toBeCloseTo(DREAD.heartSlow);
    expect(heartbeatInterval(1)).toBeCloseTo(DREAD.heartFast);
    expect(heartbeatInterval(0.5)).toBeLessThan(heartbeatInterval(0.2));
    expect(heartbeatInterval(5)).toBeCloseTo(DREAD.heartFast); // clamped
  });
});

describe("voiceGain, panFor and nextVoiceDelay", () => {
  it("a voice is silent out of range and loud up close", () => {
    expect(voiceGain(DREAD.voicePx)).toBe(0);
    expect(voiceGain(DREAD.voicePx + 100)).toBe(0);
    expect(voiceGain(0)).toBe(1);
    expect(voiceGain(100)).toBeGreaterThan(voiceGain(250));
  });

  it("an enemy on the left sounds on the left", () => {
    expect(panFor(-300)).toBe(-1);
    expect(panFor(300)).toBe(1);
    expect(panFor(0)).toBe(0);
    expect(panFor(-9999)).toBe(-1);
    expect(panFor(-150)).toBeCloseTo(-0.5);
  });

  it("an enemy speaks again after 3.5 to 8 seconds", () => {
    expect(nextVoiceDelay(0)).toBeCloseTo(DREAD.voiceMinDelay);
    expect(nextVoiceDelay(0.999)).toBeLessThanOrEqual(DREAD.voiceMaxDelay);
    expect(nextVoiceDelay(2)).toBeCloseTo(DREAD.voiceMaxDelay);
  });
});
