import type { GameState } from '../engine/types';
import type { Sound } from './sound';

const KEY = 'hexdice:music';

/** Music is off unless the player switched it on. */
export function loadMusicOn(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function saveMusicOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Ignore: remembering the choice is a convenience.
  }
}

/** Files in public/music/, by RandomMind (CC0, opengameart.org). */
export type Track = 'bards-tale' | 'battle' | 'victory' | 'defeat';

const LOOPS: Record<Track, boolean> = { 'bards-tale': true, battle: true, victory: false, defeat: false };

/**
 * What plays now: The Bard's Tale through the game, Battle once two players are left in a game that started with three
 * or more (when the last stand can fire), and the victory or defeat theme on the ending.
 */
export function trackFor(state: GameState | null): Track | null {
  if (!state) return null;
  const humans = state.players.filter((p) => p.kind === 'human');
  if (state.winner !== null) return state.players[state.winner]!.kind === 'human' ? 'victory' : 'defeat';
  if (humans.length > 0 && humans.every((p) => !p.alive)) return 'defeat';
  const alive = state.players.filter((p) => p.alive).length;
  return alive === 2 && state.players.length >= 3 ? 'battle' : 'bards-tale';
}

const LEVEL = 0.35;
const FADE_S = 2;

interface Playing {
  gain: GainNode;
  src: AudioBufferSourceNode;
}

/**
 * Music on the sound's AudioContext, so the sound switch and the iOS silent switch silence it too. Tracks crossfade,
 * and the music dips while dice roll. A track is fetched and decoded when it starts; the service worker keeps it.
 */
export class Music {
  private want: Track | null = null;
  /** The track loading or playing; it stays set after a one-off theme ends, so the theme doesn't start again. */
  private current: Track | null = null;
  private playing: Playing | null = null;
  /** Bumped by every change, so a track still loading when the scene moves on never starts. */
  private seq = 0;
  private duckGain: GainNode | null = null;

  constructor(
    private readonly sound: Sound,
    private on: boolean,
  ) {
    sound.onChange(() => this.sync());
  }

  isOn(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    this.on = on;
    saveMusicOn(on);
    this.sync();
  }

  /** The track the game is on, whether or not it can be heard; dev builds read it through window.__hexdice.music(). */
  wanted(): Track | null {
    return this.want;
  }

  play(track: Track | null): void {
    if (track === this.want) return;
    this.want = track;
    this.sync();
  }

  /** Lowers the music under a roll of the dice. */
  duck(durationMs: number, quiet: boolean): void {
    const g = this.duckGain;
    if (!g || !this.playing) return;
    const t = g.context.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(quiet ? 0.7 : 0.45, t, 0.05);
    g.gain.setTargetAtTime(1, t + durationMs / 1000, 0.25);
  }

  private sync(): void {
    const out = this.on ? this.sound.output() : null;
    const target = out ? this.want : null;
    if (this.current === target) return;
    this.seq++;
    this.fadeOut();
    this.current = target;
    if (out && target) void this.start(target, out.ctx, out.master, this.seq);
  }

  private fadeOut(): void {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    const t = p.gain.context.currentTime;
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setValueAtTime(p.gain.gain.value, t);
    p.gain.gain.linearRampToValueAtTime(0, t + FADE_S);
    try {
      p.src.stop(t + FADE_S);
    } catch {
      // Already stopped.
    }
  }

  private async start(track: Track, ctx: AudioContext, master: GainNode, seq: number): Promise<void> {
    let buffer: AudioBuffer;
    try {
      const res = await fetch(new URL(`music/${track}.m4a`, document.baseURI));
      if (!res.ok) return;
      buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return; // Offline before the track was ever played, or a browser that can't decode it: play on in silence.
    }
    if (seq !== this.seq) return;
    if (this.duckGain?.context !== ctx) {
      this.duckGain = ctx.createGain();
      this.duckGain.connect(master);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = LOOPS[track];
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(LEVEL, t + (LOOPS[track] ? FADE_S : 0.3));
    src.connect(gain).connect(this.duckGain);
    src.start(t);
    this.playing = { gain, src };
  }
}
