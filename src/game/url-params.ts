import { MAX_PLAYERS, MIN_PLAYERS } from '../engine/config';
import type { AiLevel, Speed } from '../engine/types';

export interface UrlParams {
  seed: number | null;
  players: number | null;
  aiLevel: AiLevel | null;
  speed: Speed | null;
}

const AI_LEVELS: readonly string[] = ['easy', 'normal'];
const SPEEDS: readonly string[] = ['slow', 'normal', 'fast', 'instant'];

export function parseUrlParams(search: string): UrlParams {
  const q = new URLSearchParams(search);
  const seedRaw = q.get('seed');
  const playersRaw = q.get('players');
  const ai = q.get('ai');
  const speed = q.get('speed');
  const players = playersRaw !== null && /^\d+$/.test(playersRaw) ? Number(playersRaw) : null;
  return {
    seed: seedRaw !== null && /^\d+$/.test(seedRaw) ? Number(seedRaw) >>> 0 : null,
    players: players === null ? null : Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, players)),
    aiLevel: ai !== null && AI_LEVELS.includes(ai) ? (ai as AiLevel) : null,
    speed: speed !== null && SPEEDS.includes(speed) ? (speed as Speed) : null,
  };
}
