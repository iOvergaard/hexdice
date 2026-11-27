import { MAX_PLAYERS, MIN_PLAYERS } from '../engine/config';
import type { AiLevel, ConnectionBonusRule, ReinforcementRule, Speed } from '../engine/types';

export interface UrlParams {
  seed: number | null;
  players: number | null;
  aiLevel: AiLevel | null;
  speed: Speed | null;
  /** ?sound=off|on overrides the remembered setting for this visit (tests, repro links). */
  sound: boolean | null;
  /** ?music=off|on overrides the remembered setting for this visit. */
  music: boolean | null;
  /** ?reinforce=random|frontline|weighted tries a reinforcement rule (prototype). */
  reinforcement: ReinforcementRule | null;
  /** ?link=off|flat|smaller|catchup tries a connection bonus (prototype). */
  connectionBonus: ConnectionBonusRule | null;
  /** ?shaken=on|off tries the shaken rule (prototype). */
  shaken: boolean | null;
}

const AI_LEVELS: readonly string[] = ['easy', 'normal', 'hard'];
const SPEEDS: readonly string[] = ['slow', 'normal', 'fast', 'instant'];
const REINFORCEMENTS: readonly string[] = ['random', 'frontline', 'weighted'];
const LINKS: readonly string[] = ['off', 'flat', 'smaller', 'catchup'];

export function parseUrlParams(search: string): UrlParams {
  const q = new URLSearchParams(search);
  const seedRaw = q.get('seed');
  const playersRaw = q.get('players');
  const ai = q.get('ai');
  const speed = q.get('speed');
  const sound = q.get('sound');
  const music = q.get('music');
  const reinforce = q.get('reinforce');
  const link = q.get('link');
  const shaken = q.get('shaken');
  const players = playersRaw !== null && /^\d+$/.test(playersRaw) ? Number(playersRaw) : null;
  return {
    seed: seedRaw !== null && /^\d+$/.test(seedRaw) ? Number(seedRaw) >>> 0 : null,
    players: players === null ? null : Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, players)),
    aiLevel: ai !== null && AI_LEVELS.includes(ai) ? (ai as AiLevel) : null,
    speed: speed !== null && SPEEDS.includes(speed) ? (speed as Speed) : null,
    sound: sound === 'on' ? true : sound === 'off' ? false : null,
    music: music === 'on' ? true : music === 'off' ? false : null,
    reinforcement: reinforce !== null && REINFORCEMENTS.includes(reinforce) ? (reinforce as ReinforcementRule) : null,
    connectionBonus: link !== null && LINKS.includes(link) ? (link as ConnectionBonusRule) : null,
    shaken: shaken === 'on' ? true : shaken === 'off' ? false : null,
  };
}
