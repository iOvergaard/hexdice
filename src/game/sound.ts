import { reducedMotion, TUMBLE_SHARE } from '../ui/roll-view';
import type { Cues, RollResult, Sting } from './sound-cues';

const KEY = 'hexdice:sound';

/** Sound is on unless the player switched it off. */
export function loadSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveSoundOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Ignore: remembering the choice is a convenience.
  }
}

const LEVEL = 0.6;

/**
 * Synthesised cues on one AudioContext, created on the first user gesture (browsers keep audio locked until then).
 * The default iOS audio session is kept, so the silent switch mutes it.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly live = new Set<AudioScheduledSourceNode>();
  /** Cues that reached a running context; dev builds only, read through window.__hexdice.sounds(). */
  readonly log: string[] = [];

  constructor(private on: boolean) {
    // The context may only start inside an activation-triggering event (HTML spec); later gestures also resume it
    // after an interruption such as a call or an app switch.
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
    saveSoundOn(on);
    if (!on) this.stopAll();
    if (this.master) this.master.gain.value = on ? LEVEL : 0;
    // The toggle's own click is a gesture, so the context can start right here.
    if (on) this.wake();
  }

  /** Stops everything still scheduled, e.g. when a game is abandoned mid-roll. */
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

  /** Rattle while the roll strip tumbles, then one clack per die (up to 5) as they land. */
  dice(cue: NonNullable<Cues['dice']>): void {
    const c = this.ready('dice');
    if (!c) return;
    const t0 = c.currentTime;
    const level = cue.quiet ? 0.35 : 0.8;
    const still = reducedMotion();
    const tumble = still ? 0 : (cue.durationMs * TUMBLE_SHARE) / 1000;
    if (!still) {
      const clicks = Math.max(3, Math.min(28, Math.round(tumble / 0.035)));
      for (let i = 0; i < clicks; i++) {
        this.clack(t0 + Math.random() * tumble, 2200 + Math.random() * 2600, 0.012 + Math.random() * 0.012, level * (0.4 + Math.random() * 0.5));
      }
    }
    for (let i = 0; i < Math.min(cue.dice, 5); i++) {
      this.clack(t0 + tumble + i * 0.014 + Math.random() * 0.01, 1400 + Math.random() * 900, 0.03, level);
    }
  }

  /** The roll's outcome, as the strip settles. */
  result(cue: NonNullable<Cues['result']>): void {
    const c = this.ready(cue.cue);
    if (!c) return;
    const t = c.currentTime;
    const v = cue.quiet ? 0.4 : 1;
    const kinds: Record<RollResult, () => void> = {
      capture: () => {
        this.tone(t, 523, 0.09, 'triangle', 0.35 * v);
        this.tone(t + 0.08, 784, 0.14, 'triangle', 0.35 * v);
      },
      held: () => this.sweep(t, 150, 70, 0.18, 'sine', 0.6 * v),
      draw: () => {
        this.tone(t, 392, 0.1, 'square', 0.12 * v);
        this.tone(t + 0.11, 392, 0.1, 'square', 0.12 * v);
      },
    };
    kinds[cue.cue]();
  }

  /** The knockout "big bang": a noise blast closing down over a falling boom, as long as the visual (at most 1.4 s). */
  knockout(cue: NonNullable<Cues['knockout']>): void {
    const c = this.ready('knockout');
    if (!c) return;
    const t = c.currentTime;
    const len = Math.min(cue.durationMs / 1000, 1.4);
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

  /** Soft plinks spread over your reinforcement placements. */
  place(cue: NonNullable<Cues['place']>): void {
    const c = this.ready('place');
    if (!c) return;
    const t = c.currentTime;
    const n = Math.min(cue.count, 12);
    const span = Math.max(0.05, (cue.durationMs / 1000) * 0.6);
    for (let i = 0; i < n; i++) this.tone(t + (i / n) * span, 880 + i * 40, 0.06, 'sine', 0.12);
  }

  yourTurn(): void {
    const c = this.ready('yourTurn');
    if (!c) return;
    const t = c.currentTime;
    this.tone(t, 659, 0.16, 'sine', 0.3);
    this.tone(t + 0.13, 988, 0.28, 'sine', 0.3);
  }

  sting(sting: Sting): void {
    const c = this.ready(sting);
    if (!c) return;
    const t = c.currentTime;
    if (sting === 'win') [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.12, f, 0.3, 'triangle', 0.3));
    else [392, 330, 262].forEach((f, i) => this.tone(t + i * 0.18, f, 0.35, 'sine', 0.35));
  }

  // ---- plumbing ----

  private wake(): void {
    if (!this.on) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = LEVEL;
      this.master.connect(this.ctx.destination);
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  private ready(name: string): AudioContext | null {
    if (!this.on || !this.ctx || !this.master || this.ctx.state !== 'running') return null;
    if (import.meta.env.DEV) this.log.push(name);
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
