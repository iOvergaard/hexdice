import type { GameEvent, PlayerId, Speed } from '../engine/types';
import { AI_ROLL_MS, ELIMINATION_MS, PLACE_MS, ROLL_MS } from './timing';

export type RollResult = 'capture' | 'held' | 'draw';
export type Sting = 'win' | 'lose';

export interface CueContext {
  /** The pace the events play at; 'instant' while skipping. */
  speed: Speed;
  /** The acting seat is an AI, or autoplay is on. */
  byAi: boolean;
  mode: 'play' | 'replay';
  /** Human seats alive before the action, empty under autoplay: they get the your-turn chime and the win or lose sting. */
  humans: readonly PlayerId[];
}

/** The sounds one action makes. Per-attack sounds last exactly as long as their animation. */
export interface Cues {
  dice: { durationMs: number; dice: number; quiet: boolean } | null;
  result: { cue: RollResult; quiet: boolean } | null;
  knockout: { durationMs: number } | null;
  place: { count: number; durationMs: number } | null;
  yourTurn: boolean;
  sting: Sting | null;
}

/**
 * No animation, no sound: Instant and skipping are silent, AI rolls are quiet at Slow and Normal and silent from Fast,
 * and a replay keeps only knockouts and the final sting. The your-turn chime and stings play at every speed.
 */
export function cuesFor(events: readonly GameEvent[], ctx: CueContext): Cues {
  const live = ctx.mode === 'play';
  const cues: Cues = { dice: null, result: null, knockout: null, place: null, yourTurn: false, sting: null };

  const roll = events.find((e) => e.type === 'attackRolled');
  if (roll) {
    const ms = (ctx.byAi ? AI_ROLL_MS : ROLL_MS)[ctx.speed];
    // From Fast up a round of AI rolls comes several a second, so those stay silent.
    if (live && ms > 0 && !(ctx.byAi && ctx.speed === 'fast')) {
      cues.dice = { durationMs: ms, dice: roll.attackRolls.length + roll.defendRolls.length, quiet: ctx.byAi };
      const cue: RollResult = roll.success ? 'capture' : roll.attackSum === roll.defendSum ? 'draw' : 'held';
      cues.result = { cue, quiet: ctx.byAi };
    }
    const holdMs = ELIMINATION_MS[ctx.speed];
    if (holdMs > 0 && events.some((e) => e.type === 'playerEliminated')) cues.knockout = { durationMs: holdMs };
  }

  const reinforced = events.find((e) => e.type === 'reinforced');
  const placeMs = PLACE_MS[ctx.speed];
  if (reinforced && live && !ctx.byAi && placeMs > 0 && reinforced.placed.length > 0) {
    cues.place = { count: reinforced.placed.length, durationMs: placeMs };
  }

  const turn = events.find((e) => e.type === 'turnStarted');
  cues.yourTurn = live && !!turn && ctx.humans.includes(turn.player);

  if (ctx.humans.length > 0) {
    const over = events.find((e) => e.type === 'gameOver');
    const out = new Set(events.flatMap((e) => (e.type === 'playerEliminated' ? [e.player] : [])));
    if (over && ctx.humans.includes(over.winner)) cues.sting = 'win';
    else if (ctx.humans.every((h) => out.has(h))) cues.sting = 'lose';
  }
  return cues;
}
