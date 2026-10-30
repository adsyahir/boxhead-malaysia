import type { AudioRig } from "./rig";

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]!;
const between = (a: number, b: number): number => a + Math.random() * (b - a);

/**
 * The menu soundscape: a low unsettling drone, wind, and now and then a far-off wail, a creak or a thud.
 * Built from oscillators and noise, so there is nothing to download. Fades in and out.
 */
export class MenuAmbience {
  private bus: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private noise: AudioBuffer | null = null;
  /** For tests and debugging: how many one-off sounds have played. */
  events = 0;

  constructor(private readonly getRig: () => AudioRig | null) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    const rig = this.getRig();
    if (!rig || this.running) return;
    this.running = true;
    const { ctx, out } = rig;
    const now = ctx.currentTime;

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(out);
    this.bus = bus;

    // drone: close, slightly detuned low notes beat against each other
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 420;
    droneFilter.connect(bus);
    for (const [freq, type, level] of [[55, "sine", 0.5], [55.9, "sine", 0.4], [36.7, "triangle", 0.5], [110.4, "sine", 0.1]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = level;
      osc.connect(g).connect(droneFilter);
      osc.start(now);
      this.sources.push(osc);
    }
    // the whole bed breathes slowly
    const breath = ctx.createOscillator();
    const breathDepth = ctx.createGain();
    breath.frequency.value = 0.07;
    breathDepth.gain.value = 0.05;
    breath.connect(breathDepth).connect(bus.gain);
    breath.start(now);
    this.sources.push(breath);

    // wind: looping noise through a band that drifts up and down
    const noise = this.noiseBuffer(ctx);
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 420;
    band.Q.value = 0.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.32;
    wind.connect(band).connect(windGain).connect(bus);
    const sweep = ctx.createOscillator();
    const sweepDepth = ctx.createGain();
    sweep.frequency.value = 0.11;
    sweepDepth.gain.value = 260;
    sweep.connect(sweepDepth).connect(band.frequency);
    wind.start(now);
    sweep.start(now);
    this.sources.push(wind, sweep);

    bus.gain.setTargetAtTime(0.2, now, 1.6);
    this.schedule();
  }

  stop(): void {
    const rig = this.getRig();
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const bus = this.bus;
    const sources = this.sources;
    this.bus = null;
    this.sources = [];
    if (!rig || !bus) return;
    bus.gain.cancelScheduledValues(rig.ctx.currentTime);
    bus.gain.setTargetAtTime(0, rig.ctx.currentTime, 0.35);
    setTimeout(() => {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      bus.disconnect();
    }, 1800);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.oneOff();
      this.schedule();
    }, between(5000, 11000));
  }

  private oneOff(): void {
    const rig = this.getRig();
    if (!rig || !this.bus) return;
    this.events++;
    const r = Math.random();
    if (r < 0.55) this.wail(rig);
    else if (r < 0.82) this.creak(rig);
    else this.thud(rig);
  }

  /** A distant, wavering cry, with an echo so it sounds far away across the kampung. */
  private wail({ ctx }: AudioRig): void {
    const bus = this.bus!;
    const t = ctx.currentTime;
    const dur = between(2.2, 3);
    const base = pick([420, 470, 520]);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * 1.6, t + dur * 0.35);
    osc.frequency.linearRampToValueAtTime(base * 0.85, t + dur);
    const vibrato = ctx.createOscillator();
    const vibratoDepth = ctx.createGain();
    vibrato.frequency.value = 5.5;
    vibratoDepth.gain.value = 16;
    vibrato.connect(vibratoDepth).connect(osc.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + dur * 0.35);
    env.gain.linearRampToValueAtTime(0, t + dur);
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 1700;

    const send = ctx.createGain();
    send.gain.value = 0.2;
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.38;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    echo.connect(feedback).connect(echo);

    osc.connect(env).connect(soften).connect(send);
    send.connect(bus);
    send.connect(echo);
    echo.connect(bus);
    osc.start(t);
    vibrato.start(t);
    osc.stop(t + dur + 0.1);
    vibrato.stop(t + dur + 0.1);
  }

  /** An old wooden house settling. */
  private creak({ ctx }: AudioRig): void {
    const bus = this.bus!;
    const t = ctx.currentTime;
    const dur = between(0.5, 0.9);
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(between(80, 110), t);
    osc.frequency.exponentialRampToValueAtTime(between(48, 62), t + dur);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 380;
    band.Q.value = 5;
    const shake = ctx.createGain();
    const shakeLfo = ctx.createOscillator();
    const shakeDepth = ctx.createGain();
    shake.gain.value = 0.1;
    shakeLfo.frequency.value = 11;
    shakeDepth.gain.value = 0.08;
    shakeLfo.connect(shakeDepth).connect(shake.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.08);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(band).connect(shake).connect(env).connect(bus);
    osc.start(t);
    shakeLfo.start(t);
    osc.stop(t + dur + 0.05);
    shakeLfo.stop(t + dur + 0.05);
  }

  /** Something heavy, far away. */
  private thud({ ctx }: AudioRig): void {
    const bus = this.bus!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(62, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(env).connect(bus);
    osc.start(t);
    osc.stop(t + 0.5);
  }
}
