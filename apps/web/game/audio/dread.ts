import type { EnemyKind } from "@kampung/game-core";
import { DREAD, crowdFor, heartbeatInterval, intensityFor, nextVoiceDelay, panFor, voiceGain } from "./dread-math";
import type { AudioRig } from "./rig";

export interface DreadEnemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  rise: number;
}

export interface DreadHero {
  x: number;
  y: number;
}

/**
 * The sound of being hunted. Two layers, both driven by how close the ghosts are to a hero:
 *  1. a low drone and a heartbeat that build as the nearest enemy closes in (and race when it is on top of you)
 *  2. each ghost's own voice, panned toward where it is: the pocong's rattling moan, the toyol's giggle,
 *     the pontianak's wail. They speak only when near, and not all at once.
 * Everything is synthesised; nothing is downloaded.
 */
export class DreadAudio {
  /** For debugging and tests. */
  readonly stats = { intensity: 0, nearest: Infinity, close: 0, voices: 0, beats: 0 };

  private drone: { gain: GainNode; sources: AudioScheduledSourceNode[] } | null = null;
  private noise: AudioBuffer | null = null;
  private beatClock = 0;
  private nextVoiceAt = new Map<number, number>();
  private recentVoices: number[] = [];

  constructor(private readonly getRig: () => AudioRig | null) {}

  /**
   * Call every frame. `nowSec` is any steadily increasing clock in seconds. When `active` is false (paused,
   * ended) the sound fades to silence.
   */
  update(enemies: readonly DreadEnemy[], heroes: readonly DreadHero[], dt: number, nowSec: number, active: boolean): void {
    let nearest = Infinity;
    let close = 0;
    if (active && heroes.length > 0) {
      for (const e of enemies) {
        if (e.hp <= 0 || e.rise > 0) continue;
        let d = Infinity;
        let hero = heroes[0]!;
        for (const h of heroes) {
          const dd = Math.hypot(e.x - h.x, e.y - h.y);
          if (dd < d) {
            d = dd;
            hero = h;
          }
        }
        if (d < nearest) nearest = d;
        if (d < DREAD.crowdPx) close++;
        if (d < DREAD.voicePx) this.maybeSpeak(e, d, e.x - hero.x, nowSec);
      }
      if (this.nextVoiceAt.size > enemies.length * 2 + 8) this.prune(enemies);
    }

    const intensity = intensityFor(nearest);
    const crowd = crowdFor(close);
    Object.assign(this.stats, { intensity, nearest, close });

    this.setDrone(active ? intensity * 0.16 + crowd * 0.05 : 0);

    if (active && intensity > DREAD.heartMinIntensity) {
      this.beatClock += dt;
      if (this.beatClock >= heartbeatInterval(intensity)) {
        this.beatClock = 0;
        this.heartbeat(intensity);
      }
    } else {
      this.beatClock = 0;
    }
  }

  /** Hush everything now (run ended, back to the menu). */
  silence(): void {
    this.setDrone(0);
    this.nextVoiceAt.clear();
    this.recentVoices = [];
    this.beatClock = 0;
    Object.assign(this.stats, { intensity: 0, nearest: Infinity, close: 0 });
  }

  dispose(): void {
    const d = this.drone;
    this.drone = null;
    if (!d) return;
    for (const s of d.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    d.gain.disconnect();
  }

  // ---------- layer 1: drone and heartbeat ----------

  private ensureDrone(rig: AudioRig): { gain: GainNode } {
    if (this.drone) return this.drone;
    const { ctx, out } = rig;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 170;
    lowpass.connect(gain).connect(out);
    const sources: AudioScheduledSourceNode[] = [];
    for (const [freq, type] of [[46, "sawtooth"], [48.6, "triangle"], [92.5, "sine"]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(lowpass);
      osc.start();
      sources.push(osc);
    }
    this.drone = { gain, sources };
    return this.drone;
  }

  private setDrone(target: number): void {
    const rig = this.getRig();
    if (!rig) return;
    if (!this.drone && target <= 0.001) return;
    const d = this.ensureDrone(rig);
    d.gain.gain.setTargetAtTime(target, rig.ctx.currentTime, 0.35);
  }

  private heartbeat(intensity: number): void {
    const rig = this.getRig();
    if (!rig) return;
    this.stats.beats++;
    const { ctx, out } = rig;
    const t = ctx.currentTime;
    const vol = 0.18 + intensity * 0.5;
    for (const [offset, level] of [[0, 1], [0.2, 0.6]] as const) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(72, t + offset);
      osc.frequency.exponentialRampToValueAtTime(38, t + offset + 0.15);
      env.gain.setValueAtTime(0, t + offset);
      env.gain.linearRampToValueAtTime(vol * level, t + offset + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.2);
      osc.connect(env).connect(out);
      osc.start(t + offset);
      osc.stop(t + offset + 0.25);
    }
  }

  // ---------- layer 2: voices ----------

  private maybeSpeak(e: DreadEnemy, distance: number, dx: number, nowSec: number): void {
    const next = this.nextVoiceAt.get(e.id);
    if (next === undefined) {
      // first sighting: speak a little sooner than the usual gap
      this.nextVoiceAt.set(e.id, nowSec + nextVoiceDelay(Math.random()) * 0.5);
      return;
    }
    if (nowSec < next) return;
    this.recentVoices = this.recentVoices.filter((t) => nowSec - t < DREAD.voiceWindowSec);
    if (this.recentVoices.length >= DREAD.maxVoicesPerWindow) return; // try again next frame, never a wall of noise
    this.recentVoices.push(nowSec);
    this.nextVoiceAt.set(e.id, nowSec + nextVoiceDelay(Math.random()));
    this.speak(e.kind, voiceGain(distance), panFor(dx));
  }

  private prune(enemies: readonly DreadEnemy[]): void {
    const alive = new Set(enemies.map((e) => e.id));
    for (const id of this.nextVoiceAt.keys()) if (!alive.has(id)) this.nextVoiceAt.delete(id);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }

  private speak(kind: EnemyKind, gain: number, pan: number): void {
    const rig = this.getRig();
    if (!rig || gain <= 0.01) return;
    this.stats.voices++;
    const { ctx, out } = rig;
    const t = ctx.currentTime;

    const bus = ctx.createGain();
    bus.gain.value = gain;
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      bus.connect(panner).connect(out);
    } else {
      bus.connect(out);
    }

    if (kind === "pocong") this.moan(ctx, bus, t);
    else if (kind === "toyol") this.giggle(ctx, bus, t);
    else this.wail(ctx, bus, t);
  }

  /** The pocong: a wet, rattling groan from inside a burial shroud. */
  private moan(ctx: AudioContext, bus: AudioNode, t: number): void {
    const dur = 1.1;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(ctx);
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(420, t);
    band.frequency.linearRampToValueAtTime(260, t + dur);
    band.Q.value = 3.5;
    const rattle = ctx.createGain();
    const rattleLfo = ctx.createOscillator();
    const rattleDepth = ctx.createGain();
    rattle.gain.value = 0.5;
    rattleLfo.frequency.value = 9;
    rattleDepth.gain.value = 0.45;
    rattleLfo.connect(rattleDepth).connect(rattle.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.55, t + 0.25);
    env.gain.linearRampToValueAtTime(0, t + dur);
    noise.connect(band).connect(rattle).connect(env).connect(bus);

    const voice = ctx.createOscillator();
    voice.type = "sawtooth";
    voice.frequency.setValueAtTime(96, t);
    voice.frequency.linearRampToValueAtTime(60, t + dur);
    const voiceFilter = ctx.createBiquadFilter();
    voiceFilter.type = "lowpass";
    voiceFilter.frequency.value = 300;
    const voiceEnv = ctx.createGain();
    voiceEnv.gain.setValueAtTime(0, t);
    voiceEnv.gain.linearRampToValueAtTime(0.4, t + 0.2);
    voiceEnv.gain.linearRampToValueAtTime(0, t + dur);
    voice.connect(voiceFilter).connect(voiceEnv).connect(bus);

    noise.start(t);
    rattleLfo.start(t);
    voice.start(t);
    for (const s of [noise, rattleLfo, voice]) s.stop(t + dur + 0.1);
  }

  /** The toyol: a child's giggle, which is the worst thing it could be. */
  private giggle(ctx: AudioContext, bus: AudioNode, t: number): void {
    for (let k = 0; k < 4; k++) {
      const start = t + k * 0.12;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1000 + k * 40, start);
      osc.frequency.linearRampToValueAtTime(1380 + k * 40, start + 0.09);
      const vibrato = ctx.createOscillator();
      const vibratoDepth = ctx.createGain();
      vibrato.frequency.value = 16;
      vibratoDepth.gain.value = 40;
      vibrato.connect(vibratoDepth).connect(osc.frequency);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(0.28, start + 0.015);
      env.gain.linearRampToValueAtTime(0, start + 0.1);
      osc.connect(env).connect(bus);
      osc.start(start);
      vibrato.start(start);
      osc.stop(start + 0.12);
      vibrato.stop(start + 0.12);
    }
  }

  /** The pontianak: the long, rising cry that makes the hair stand up. */
  private wail(ctx: AudioContext, bus: AudioNode, t: number): void {
    const dur = 1.7;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(560, t);
    osc.frequency.linearRampToValueAtTime(980, t + dur * 0.4);
    osc.frequency.linearRampToValueAtTime(520, t + dur);
    const vibrato = ctx.createOscillator();
    const vibratoDepth = ctx.createGain();
    vibrato.frequency.value = 6.5;
    vibratoDepth.gain.value = 28;
    vibrato.connect(vibratoDepth).connect(osc.frequency);
    const octave = ctx.createOscillator();
    octave.type = "triangle";
    octave.frequency.setValueAtTime(1120, t);
    octave.frequency.linearRampToValueAtTime(1960, t + dur * 0.4);
    octave.frequency.linearRampToValueAtTime(1040, t + dur);
    const octaveGain = ctx.createGain();
    octaveGain.gain.value = 0.3;
    octave.connect(octaveGain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + dur * 0.3);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(env);
    octaveGain.connect(env);
    env.connect(bus);
    for (const s of [osc, vibrato, octave]) s.start(t);
    for (const s of [osc, vibrato, octave]) s.stop(t + dur + 0.1);
  }
}
