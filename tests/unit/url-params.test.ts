import { describe, expect, it } from 'vitest';
import { parseUrlParams } from '../../src/game/url-params';

describe('parseUrlParams', () => {
  it('parses a full query', () => {
    expect(parseUrlParams('?seed=42&players=4&ai=easy&speed=instant&sound=off')).toEqual({
      seed: 42,
      players: 4,
      aiLevel: 'easy',
      speed: 'instant',
      sound: false,
    });
  });
  it('clamps players to 2..8', () => {
    expect(parseUrlParams('?players=99').players).toBe(8);
    expect(parseUrlParams('?players=1').players).toBe(2);
  });
  it('returns null for an invalid seed', () => {
    expect(parseUrlParams('?seed=abc').seed).toBeNull();
  });
  it('returns null for unknown ai and speed', () => {
    const p = parseUrlParams('?ai=godlike&speed=warp');
    expect(p.aiLevel).toBeNull();
    expect(p.speed).toBeNull();
  });
  it('returns all null for an empty string', () => {
    expect(parseUrlParams('')).toEqual({ seed: null, players: null, aiLevel: null, speed: null, sound: null });
  });
  it('reads sound=on and sound=off, ignores anything else', () => {
    expect(parseUrlParams('?sound=on').sound).toBe(true);
    expect(parseUrlParams('?sound=off').sound).toBe(false);
    expect(parseUrlParams('?sound=loud').sound).toBeNull();
  });
});
