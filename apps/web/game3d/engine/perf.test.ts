import { describe, expect, it } from "vitest";
import { PerfMeter, pingBand, pingSummary } from "./perf";

describe("PerfMeter", () => {
  it("reports fps, average and worst frame over the last second", () => {
    const m = new PerfMeter();
    let t = 0;
    for (let i = 0; i < 59; i++) m.add((t += 16), 16, 4);
    m.add((t += 50), 50, 6); // one hitch
    const s = m.summary();
    expect(s.worstMs).toBe(50);
    expect(s.frameMs).toBeGreaterThan(16);
    expect(s.fps).toBeGreaterThan(50);
    expect(s.fps).toBeLessThan(62.5);
  });

  it("forgets frames older than a second", () => {
    const m = new PerfMeter();
    m.add(0, 100, 1);
    m.add(2000, 16, 1);
    expect(m.summary().worstMs).toBe(16);
  });

  it("is empty before any frame", () => {
    expect(new PerfMeter().summary()).toEqual({ fps: 0, frameMs: 0, worstMs: 0, cpuMs: 0 });
  });
});

describe("pingSummary / pingBand", () => {
  it("averages round trips and measures jitter as the mean change", () => {
    expect(pingSummary([40, 60, 40, 60])).toEqual({ pingMs: 50, jitterMs: 20 });
    expect(pingSummary([])).toEqual({ pingMs: 0, jitterMs: 0 });
  });

  it("bands ping for the colour", () => {
    expect(pingBand(30)).toBe("good");
    expect(pingBand(120)).toBe("fair");
    expect(pingBand(200)).toBe("poor");
  });
});
