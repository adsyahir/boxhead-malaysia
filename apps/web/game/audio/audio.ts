import type { WeaponId } from "@kampung/game-core";
import { MUTE_KEY } from "../constants";

/** Synthesised placeholder SFX (WebAudio). Real samples can replace `play` later. */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      this.muted = false;
    }
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      /* storage unavailable: mute just won't persist */
    }
    return this.muted;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  private noise(dur: number, vol: number, cutoff: number): void {
    if (!this.ctx || !this.master || this.noiseBuf === null || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  fire(w: WeaponId): void {
    switch (w) {
      case "lastik": return this.tone(520, 0.08, "triangle", 0.25, 220);
      case "uzi": return this.tone(300, 0.05, "square", 0.12, 160);
      case "senapangPatah": return this.noise(0.18, 0.5, 3000);
      case "pagarBuluh": return this.tone(180, 0.12, "square", 0.2, 120);
      case "tongGas": return this.tone(140, 0.15, "sawtooth", 0.2, 90);
      case "bomIkan": return this.tone(260, 0.12, "sine", 0.25, 520);
      case "mercunBola": return this.tone(200, 0.1, "square", 0.2, 140);
      case "meriamBuluh": return this.noise(0.3, 0.5, 1800);
    }
  }
  explosion(): void { this.noise(0.55, 0.9, 2200); this.tone(70, 0.4, "sine", 0.5, 30); }
  hurt(): void { this.tone(180, 0.15, "sawtooth", 0.3, 90); }
  death(): void { this.tone(200, 0.6, "sawtooth", 0.35, 40); }
  hit(): void { this.tone(420, 0.04, "square", 0.08, 300); }
  kill(): void { this.noise(0.12, 0.3, 1200); }
  pickup(): void { this.tone(660, 0.08, "sine", 0.25); setTimeout(() => this.tone(990, 0.1, "sine", 0.25), 70); }
  weaponUnlocked(): void { [520, 660, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.15, "triangle", 0.3), i * 90)); }
  fireball(): void { this.tone(400, 0.3, "sawtooth", 0.15, 120); }
  wave(): void { this.tone(150, 0.5, "sawtooth", 0.3, 220); }
}

export const audio = new AudioManager();
