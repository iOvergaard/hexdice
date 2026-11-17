// SPIKE for docs/sound-proposal.md: synthesised cues on one native AudioContext. Throwaway, not meant for merge as is.

const KEY = 'hexdice:sound';

export type Cue = 'capture' | 'held' | 'draw' | 'yourTurn' | 'win' | 'lose';

function loadOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Remembering the choice is a convenience.
  }
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly live = new Set<AudioScheduledSourceNode>();
  private on = loadOn();
  /** Cues started, for tests and the spike's hands-on check. */
  readonly log: string[] = [];

  constructor() {
    // Activation-triggering events (HTML spec): the context may only start inside one of these.
    const wake = (): void => this.wake();
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const) {
      document.addEventListener(type, wake, { capture: true, passive: true });
    }
  }

  isOn(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    this.on = on;
    saveOn(on);
    if (!on) this.stopAll();
    if (this.master) this.master.gain.value = on ? 0.6 : 0;
    // The toggle's own click is a user gesture, so the context can start right here.
    if (on) this.wake();
  }

  /** Stops everything still scheduled, e.g. when the game is abandoned mid-roll. */
  stopAll(): void {
    for (const n of this.live) {
      try {
        n.stop();
      } catch {
        // Already stopped.
      }
    }
    this.live.clear();
  }

  /** Dice tumble then land, timed to the roll strip: it tumbles for 70% of the roll and settles at the end. */
  dice(durationMs: number, count: number, quiet: boolean): void {
    const c = this.ready('dice');
    if (!c) return;
    const t0 = c.currentTime;
    const tumble = (durationMs * 0.7) / 1000;
    const level = quiet ? 0.35 : 0.8;
    if (!reducedMotion()) {
      const clicks = Math.max(3, Math.min(28, Math.round(tumble / 0.035)));
      for (let i = 0; i < clicks; i++) this.clack(t0 + Math.random() * tumble, 2200 + Math.random() * 2600, 0.012 + Math.random() * 0.012, level * (0.4 + Math.random() * 0.5));
    }
    const land = t0 + (reducedMotion() ? 0 : tumble);
    for (let i = 0; i < Math.min(count, 5); i++) this.clack(land + i * 0.014 + Math.random() * 0.01, 1400 + Math.random() * 900, 0.03, level);
  }

  /** The roll's outcome, played as the strip settles. */
  cue(cue: Cue, quiet = false): void {
    const c = this.ready(cue);
    if (!c) return;
    const t = c.currentTime;
    const v = quiet ? 0.4 : 1;
    switch (cue) {
      case 'capture':
        this.tone(t, 523, 0.09, 'triangle', 0.35 * v);
        this.tone(t + 0.08, 784, 0.14, 'triangle', 0.35 * v);
        break;
      case 'held':
        this.sweep(t, 150, 70, 0.18, 'sine', 0.6 * v);
        break;
      case 'draw':
        this.tone(t, 392, 0.1, 'square', 0.12 * v);
        this.tone(t + 0.11, 392, 0.1, 'square', 0.12 * v);
        break;
      case 'yourTurn':
        this.tone(t, 659, 0.16, 'sine', 0.3);
        this.tone(t + 0.13, 988, 0.28, 'sine', 0.3);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.12, f, 0.3, 'triangle', 0.3));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this.tone(t + i * 0.18, f, 0.35, 'sine', 0.35));
        break;
    }
  }

  /** The knockout "big bang": a filtered noise blast over a falling boom, held as long as the visual. */
  knockout(durationMs: number): void {
    const c = this.ready('knockout');
    if (!c || !this.noise) return;
    const t = c.currentTime;
    const len = Math.min(durationMs / 1000, 1.4);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(lp).connect(g).connect(this.master!);
    this.start(src, t, t + len);
    this.sweep(t, 110, 35, len * 0.8, 'sine', 0.9);
  }

  /** Soft plinks spread over the placement animation. */
  place(count: number, durationMs: number): void {
    const c = this.ready('place');
    if (!c) return;
    const t = c.currentTime;
    const n = Math.min(count, 12);
    const span = Math.max(0.05, (durationMs / 1000) * 0.6);
    for (let i = 0; i < n; i++) this.tone(t + (i / n) * span, 880 + i * 40, 0.06, 'sine', 0.12);
  }

  // ---- plumbing ----

  private wake(): void {
    if (!this.on) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    // Also brings it back after an iOS interruption (call, app switch).
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  private ready(name: string): AudioContext | null {
    if (!this.on || !this.ctx || !this.master || this.ctx.state !== 'running') return null;
    this.log.push(name);
    return this.ctx;
  }

  private start(src: AudioScheduledSourceNode, at: number, until: number): void {
    this.live.add(src);
    src.onended = () => this.live.delete(src);
    src.start(at);
    src.stop(until + 0.05);
  }

  private clack(at: number, freq: number, len: number, level: number): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(bp).connect(g).connect(this.master!);
    this.start(src, at, at + len);
  }

  private tone(at: number, freq: number, len: number, type: OscillatorType, level: number): void {
    this.sweep(at, freq, freq, len, type, level);
  }

  private sweep(at: number, from: number, to: number, len: number, type: OscillatorType, level: number): void {
    const c = this.ctx!;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    osc.connect(g).connect(this.master!);
    this.start(osc, at, at + len);
  }
}
