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

let crashes = 0;
let illegalActions = 0;
let roundCapHits = 0;
let attacks = 0;
let ties = 0;
let links = 0;
let linkDice = 0;
let lastStands = 0;

interface Result {
  winner: number | null;
  rounds: number;
  state: GameState | null;
}

function play(levels: AiLevel[], seed: number): Result {
  try {
    let state = createGame(makeConfig(aiSeats(levels), seed, { lossRule, eliminationBonus, reinforcement, connectionBonus, lastStandDice, frontlineOverflow }));
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
        if (e.type === 'linked') {
          links++;
          linkDice += e.bonus;
        }
        if (e.type !== 'attackRolled') continue;
        attacks++;
        if (e.attackSum === e.defendSum) ties++;
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

let normalWins = 0;
for (let i = 0; i < duelGames; i++) {
  // Seat order alternates; createGame shuffles turn order, so the winner's level is read from the final state.
  const levels: AiLevel[] = i % 2 === 0 ? ['normal', 'easy'] : ['easy', 'normal'];
  const r = play(levels, baseSeed + i);
  if (r.state && r.winner !== null && r.state.players[r.winner]!.aiLevel === 'normal') normalWins++;
}

const winsBySeat = new Array<number>(8).fill(0);
let roundSum = 0;
let maxRounds = 0;
const eightRounds: number[] = [];
for (let i = 0; i < eightGames; i++) {
  const r = play(Array.from({ length: 8 }, () => 'normal' as const), baseSeed + 100000 + i);
  roundSum += r.rounds;
  maxRounds = Math.max(maxRounds, r.rounds);
  eightRounds.push(r.rounds);
  if (r.winner !== null) winsBySeat[r.winner]!++;
}

const durationMs = Date.now() - started;
const winRate = duelGames === 0 ? 0 : normalWins / duelGames;
const lengths = lengthStats(eightRounds);
const tooLong = lengthFailures(lengths);
const result = {
  date: new Date().toISOString(),
  games,
  rules: { lossRule, eliminationBonus, reinforcement, connectionBonus, lastStandDice, frontlineOverflow },
  links: { count: links, dice: linkDice },
  lastStands,
  normalVsEasy: { games: duelGames, normalWins, winRate },
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
console.log(`Rules: lossRule=${lossRule} eliminationBonus=${eliminationBonus} reinforcement=${reinforcement} connection=${connectionBonus} lastStand=${lastStandDice} overflow=${frontlineOverflow}; ${attacks} attacks, ${ties} draws (${((ties / Math.max(1, attacks)) * 100).toFixed(1)}%)`);
console.log(`Normal vs Easy: ${normalWins}/${duelGames} (${(winRate * 100).toFixed(1)}%)`);
console.log(`8-player: avg ${result.eightPlayer.avgRounds.toFixed(1)} rounds, max ${maxRounds}, wins by seat [${winsBySeat.join(', ')}]`);
console.log(
  `Game length (8-player): p50 ${lengths.p50}, p90 ${lengths.p90} (≤ ${LENGTH_LIMITS.maxP90}), p99 ${lengths.p99} (≤ ${LENGTH_LIMITS.maxP99}), ` +
    `${(lengths.over60Share * 100).toFixed(1)}% past 60 rounds (≤ ${LENGTH_LIMITS.maxOver60Share * 100}%)`,
);
console.log(`crashes ${crashes}, illegal ${illegalActions}, cap hits ${roundCapHits}, ${(durationMs / 1000).toFixed(1)} s`);

for (const f of tooLong) console.error(`Game length gate: ${f}`);
if (crashes > 0 || illegalActions > 0 || roundCapHits > 0 || winRate < MIN_WIN_RATE || tooLong.length > 0) {
  console.error('SIM FAILED');
  process.exit(1);
}
