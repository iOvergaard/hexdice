// What happened in a game, read from its event log. Pure: no DOM, no rules decided here.
import { winProbability } from '../engine/odds';
import type { GameEvent, GameState, PlayerId } from '../engine/types';

export interface Standing {
  player: PlayerId;
  /** 1 is the winner. Null for a player who was already out when the log started. */
  place: number | null;
  /** Round they were knocked out in, and by whom; null while still in. */
  outRound: number | null;
  outBy: PlayerId | null;
  /** Most territories held at once, and the first round they held that many. */
  peak: number;
  peakRound: number;
  captures: number;
  knockouts: number;
}

/** The least likely attack a player won. */
export interface Upset {
  round: number;
  attackDice: number;
  defendDice: number;
  chance: number;
}

/** The turn in which a player took the most territories. */
export interface BigTurn {
  round: number;
  captures: number;
}

export interface Sample {
  round: number;
  /** Territories held, indexed by player id. */
  counts: number[];
}

export interface GameSummary {
  winner: PlayerId | null;
  rounds: number;
  players: number;
  /** Finishing order: the winner (or those still in, most territories first), then the rest by when they went out. */
  standings: Standing[];
  /** One sample when the log starts, one at the start of every later round, one at the end. */
  timeline: Sample[];
  /** Indexed by player id; null if they never won an attack (or never took more than nothing in a turn). */
  upsets: (Upset | null)[];
  bigTurns: (BigTurn | null)[];
}

function countTerritories(state: GameState): number[] {
  const counts = state.players.map(() => 0);
  for (const t of state.territories) counts[t.owner]!++;
  return counts;
}

/** `start` is the state the event log begins from, `end` the state after its last event. */
export function summarise(start: GameState, events: readonly GameEvent[], end: GameState): GameSummary {
  const n = start.players.length;
  const counts = countTerritories(start);
  let alive = start.players.filter((p) => p.alive).length;
  let round = start.round;
  const timeline: Sample[] = [{ round, counts: [...counts] }];
  const standings: Standing[] = start.players.map((p) => ({
    player: p.id,
    place: null,
    outRound: null,
    outBy: null,
    peak: counts[p.id]!,
    peakRound: round,
    captures: 0,
    knockouts: 0,
  }));
  const upsets: (Upset | null)[] = start.players.map(() => null);
  const bigTurns: (BigTurn | null)[] = start.players.map(() => null);
  let turnCaptures = start.players.map(() => 0);

  for (const e of events) {
    switch (e.type) {
      case 'attackRolled': {
        if (!e.success) break;
        const chance = winProbability(e.attackRolls.length, e.defendRolls.length);
        const best = upsets[e.attacker];
        if (!best || chance < best.chance) {
          upsets[e.attacker] = { round, attackDice: e.attackRolls.length, defendDice: e.defendRolls.length, chance };
        }
        break;
      }
      case 'territoryCaptured': {
        counts[e.previousOwner]!--;
        counts[e.newOwner]!++;
        const s = standings[e.newOwner]!;
        s.captures++;
        if (counts[e.newOwner]! > s.peak) {
          s.peak = counts[e.newOwner]!;
          s.peakRound = round;
        }
        const taken = ++turnCaptures[e.newOwner]!;
        if (taken > (bigTurns[e.newOwner]?.captures ?? 0)) bigTurns[e.newOwner] = { round, captures: taken };
        break;
      }
      case 'playerEliminated': {
        alive--;
        const s = standings[e.player]!;
        s.place = alive + 1;
        s.outRound = round;
        s.outBy = e.by;
        standings[e.by]!.knockouts++;
        break;
      }
      case 'turnStarted':
        // Once per round: per turn, a two-player duel swings back and forth and drowns the trend.
        if (e.round !== round) timeline.push({ round: e.round, counts: [...counts] });
        round = e.round;
        turnCaptures = turnCaptures.map(() => 0);
        break;
      case 'gameOver':
        standings[e.winner]!.place = 1;
        break;
      default:
        break;
    }
  }
  timeline.push({ round: end.round, counts: [...counts] });

  // Still in (no winner yet): rank by territories held now, so the summary reads as "so far".
  const stillIn = standings.filter((s) => s.place === null && end.players[s.player]!.alive);
  stillIn.sort((a, b) => counts[b.player]! - counts[a.player]! || a.player - b.player);
  stillIn.forEach((s, i) => (s.place = i + 1));

  const order = [...standings].sort((a, b) => (a.place ?? n + 1) - (b.place ?? n + 1) || a.player - b.player);
  return { winner: end.winner, rounds: end.round, players: n, standings: order, timeline, upsets, bigTurns };
}

const ORDINALS = ['th', 'st', 'nd', 'rd'];

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th. */
export function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${ORDINALS[(v - 20) % 10] ?? ORDINALS[v] ?? ORDINALS[0]}`;
}
