import { writeFileSync } from 'node:fs';
import { chooseAction } from '../src/ai';
import { DEFAULT_RULES, makeConfig } from '../src/engine/config';
import { Rng } from '../src/engine/rng';
import { applyAction, isLegalAttack } from '../src/engine/rules';
import { aiSeats } from '../src/engine/seats';
import { createGame } from '../src/engine/setup';
import type { AiLevel, ConnectionBonusRule, FrontlineOverflow, GameState, LossRule, ReinforcementRule } from '../src/engine/types';
import { LENGTH_LIMITS, lengthFailures, lengthStats } from './stats';

const ROUND_CAP = 1000;
const MIN_WIN_RATE = 0.7;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const games = Number(arg('games', '500'));
const baseSeed = Number(arg('seed', '1'));
const out = arg('out', 'playtest/sim-latest.json');
const lossRule = arg('loss-rule', DEFAULT_RULES.lossRule) as LossRule;
if (!['classic', 'attrition', 'drawAttrition', 'halfStack'].includes(lossRule)) throw new Error(`unknown --loss-rule ${lossRule}`);
const eliminationBonus = Number(arg('elimination-bonus', '1'));
const reinforcement = arg('reinforcement', DEFAULT_RULES.reinforcement) as ReinforcementRule;
if (!['random', 'frontline', 'weighted'].includes(reinforcement)) throw new Error(`unknown --reinforcement ${reinforcement}`);
const connectionBonus = arg('connection', DEFAULT_RULES.connectionBonus) as ConnectionBonusRule;
if (!['off', 'flat', 'smaller', 'catchup'].includes(connectionBonus)) throw new Error(`unknown --connection ${connectionBonus}`);
const lastStandDice = Number(arg('last-stand', String(DEFAULT_RULES.lastStandDice)));
const frontlineOverflow = arg('overflow', DEFAULT_RULES.frontlineOverflow) as FrontlineOverflow;
if (!['behind', 'reserve'].includes(frontlineOverflow)) throw new Error(`unknown --overflow ${frontlineOverflow}`);
const seatTables = Number(arg('seat-tables', String(DEFAULT_RULES.seatTables)));
const shakenArg = arg('shaken', DEFAULT_RULES.shaken ? 'on' : 'off');
if (!['on', 'off'].includes(shakenArg)) throw new Error(`unknown --shaken ${shakenArg}`);
const shaken = shakenArg === 'on';

let crashes = 0;
let illegalActions = 0;
let roundCapHits = 0;
let attacks = 0;
let ties = 0;
let links = 0;
let linkDice = 0;
let lastStands = 0;
let shakes = 0;
let shakenAttacks = 0;
let shakenWins = 0;

interface Result {
  winner: number | null;
  rounds: number;
  state: GameState | null;
}

function play(levels: AiLevel[], seed: number): Result {
  try {
    let state = createGame(makeConfig(aiSeats(levels), seed, { lossRule, eliminationBonus, reinforcement, connectionBonus, lastStandDice, frontlineOverflow, seatTables, shaken }));
    const rng = new Rng(seed ^ 0x9e3779b9);
    while (state.winner === null) {
      if (state.round > ROUND_CAP) {
        roundCapHits++;
        return { winner: null, rounds: state.round, state };
      }
      const action = chooseAction(state, state.players[state.current]!.aiLevel!, rng);
      if (action.type === 'attack' && !isLegalAttack(state, action.from, action.to)) {
        illegalActions++;
        return { winner: null, rounds: state.round, state: null };
      }
      const result = applyAction(state, action);
      for (const e of result.events) {
        if (e.type === 'lastStand') lastStands++;
        if (e.type === 'shaken') shakes++;
        if (e.type === 'linked') {
          links++;
          linkDice += e.bonus;
        }
        if (e.type !== 'attackRolled') continue;
        attacks++;
        if (e.attackSum === e.defendSum) ties++;
        if (e.shaken) {
          shakenAttacks++;
          if (e.success) shakenWins++;
        }
      }
      state = result.state;
    }
    return { winner: state.winner, rounds: state.round, state };
  } catch (e) {
    crashes++;
    console.error(`crash (seed ${seed}):`, e);
    return { winner: null, rounds: 0, state: null };
  }
}

const started = Date.now();
const duelGames = Math.floor(games / 2);
const eightGames = games - duelGames;

/** Wins for `level` in 1v1 games against Easy. Seat order alternates; createGame shuffles turn order, so the winner's level is read from the final state. */
function duels(level: AiLevel, count: number, seed: number): { games: number; wins: number; winRate: number } {
  let wins = 0;
  for (let i = 0; i < count; i++) {
    const levels: AiLevel[] = i % 2 === 0 ? [level, 'easy'] : ['easy', level];
    const r = play(levels, seed + i);
    if (r.state && r.winner !== null && r.state.players[r.winner]!.aiLevel === level) wins++;
  }
  return { games: count, wins, winRate: count === 0 ? 0 : wins / count };
}

// Hard is the player called Normal until 23-11-2026 and keeps the first of its seeds; Normal gets fresh ones.
const hardVsEasy = duels('hard', Math.ceil(duelGames / 2), baseSeed);
const normalVsEasy = duels('normal', Math.floor(duelGames / 2), baseSeed + 50000);

const winsBySeat = new Array<number>(8).fill(0);
let roundSum = 0;
let maxRounds = 0;
const eightRounds: number[] = [];
for (let i = 0; i < eightGames; i++) {
  // All Hard: the longest games, so the length gate covers every table.
  const r = play(Array.from({ length: 8 }, () => 'hard' as const), baseSeed + 100000 + i);
  roundSum += r.rounds;
  maxRounds = Math.max(maxRounds, r.rounds);
  eightRounds.push(r.rounds);
  if (r.winner !== null) winsBySeat[r.winner]!++;
}

const durationMs = Date.now() - started;
const lengths = lengthStats(eightRounds);
const tooLong = lengthFailures(lengths);
const result = {
  date: new Date().toISOString(),
  games,
  rules: { lossRule, eliminationBonus, reinforcement, connectionBonus, lastStandDice, frontlineOverflow, seatTables, shaken },
  links: { count: links, dice: linkDice },
  lastStands,
  shaken: { holds: shakes, attacks: shakenAttacks, wins: shakenWins },
  hardVsEasy,
  normalVsEasy,
  eightPlayer: { games: eightGames, avgRounds: eightGames ? roundSum / eightGames : 0, maxRounds, winsBySeat },
  gameLength: { ...lengths, limits: LENGTH_LIMITS, failures: tooLong },
  crashes,
  illegalActions,
  roundCapHits,
  attacks,
  ties,
  durationMs,
};
writeFileSync(out, JSON.stringify(result, null, 2) + '\n');

console.log(`Links: ${links} (${linkDice} bonus dice) · last stands: ${lastStands}`);
if (shaken) console.log(`Shaken: ${shakes} holds; ${shakenAttacks} attacks on a shaken defender, ${shakenWins} won`);
console.log(`Rules: lossRule=${lossRule} eliminationBonus=${eliminationBonus} reinforcement=${reinforcement} connection=${connectionBonus} lastStand=${lastStandDice} overflow=${frontlineOverflow} seatTables=${seatTables} shaken=${shakenArg}; ${attacks} attacks, ${ties} draws (${((ties / Math.max(1, attacks)) * 100).toFixed(1)}%)`);
for (const [name, d] of [['Hard', hardVsEasy], ['Normal', normalVsEasy]] as const) console.log(`${name} vs Easy: ${d.wins}/${d.games} (${(d.winRate * 100).toFixed(1)}%)`);
console.log(`8-player: avg ${result.eightPlayer.avgRounds.toFixed(1)} rounds, max ${maxRounds}, wins by seat [${winsBySeat.join(', ')}]`);
console.log(
  `Game length (8-player): p50 ${lengths.p50}, p90 ${lengths.p90} (≤ ${LENGTH_LIMITS.maxP90}), p99 ${lengths.p99} (≤ ${LENGTH_LIMITS.maxP99}), ` +
    `${(lengths.over60Share * 100).toFixed(1)}% past 60 rounds (≤ ${LENGTH_LIMITS.maxOver60Share * 100}%)`,
);
console.log(`crashes ${crashes}, illegal ${illegalActions}, cap hits ${roundCapHits}, ${(durationMs / 1000).toFixed(1)} s`);

for (const f of tooLong) console.error(`Game length gate: ${f}`);
if (crashes > 0 || illegalActions > 0 || roundCapHits > 0 || hardVsEasy.winRate < MIN_WIN_RATE || normalVsEasy.winRate < MIN_WIN_RATE || tooLong.length > 0) {
  console.error('SIM FAILED');
  process.exit(1);
}
