/** Numbers shown by the performance overlay (Settings: Performance display). */
export interface PerfStats {
  fps: number;
  /** Average time between frames, ms. */
  frameMs: number;
  /** Slowest frame in the window, ms (stutter shows here first). */
  worstMs: number;
  /** Time spent on simulation + render per frame, ms. */
  cpuMs: number;
  online?: NetStats;
}

export interface NetStats {
  /** Round trip to the room server, ms (average of the last few pings). */
  pingMs: number;
  /** How much the round trip varies, ms. */
  jitterMs: number;
  /** Snapshots received per second (the server sends 20). */
  snapsPerSec: number;
  /** How far your predicted hero was from the server's position at the last check, px. */
  predictErrPx: number | null;
}

/** Rolling one-second window of frame times. Time is passed in, so it is testable. */
export class PerfMeter {
  private frames: { at: number; dt: number; cpu: number }[] = [];

  add(nowMs: number, frameMs: number, cpuMs: number): void {
    this.frames.push({ at: nowMs, dt: frameMs, cpu: cpuMs });
    while (this.frames.length > 0 && this.frames[0]!.at < nowMs - 1000) this.frames.shift();
  }

  summary(): Omit<PerfStats, "online"> {
    const n = this.frames.length;
    if (n === 0) return { fps: 0, frameMs: 0, worstMs: 0, cpuMs: 0 };
    let dt = 0;
    let cpu = 0;
    let worst = 0;
    for (const f of this.frames) {
      dt += f.dt;
      cpu += f.cpu;
      worst = Math.max(worst, f.dt);
    }
    const frameMs = dt / n;
    return { fps: frameMs > 0 ? 1000 / frameMs : 0, frameMs, worstMs: worst, cpuMs: cpu / n };
  }
}

/** Average and jitter (mean change between consecutive samples) of recent round trips. */
export function pingSummary(samples: readonly number[]): { pingMs: number; jitterMs: number } {
  if (samples.length === 0) return { pingMs: 0, jitterMs: 0 };
  const pingMs = samples.reduce((s, v) => s + v, 0) / samples.length;
  let jitter = 0;
  for (let i = 1; i < samples.length; i++) jitter += Math.abs(samples[i]! - samples[i - 1]!);
  return { pingMs, jitterMs: samples.length > 1 ? jitter / (samples.length - 1) : 0 };
}

/** Colour band for a ping: good under 80 ms, fair under 150 ms, else poor. */
export function pingBand(ms: number): "good" | "fair" | "poor" {
  return ms < 80 ? "good" : ms < 150 ? "fair" : "poor";
}
