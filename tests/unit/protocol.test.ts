import { describe, expect, it } from 'vitest';
import { makeConfig } from '../../src/engine/config';
import { applyAction, legalAttacks } from '../../src/engine/rules';
import { defaultSeats } from '../../src/engine/seats';
import { createGame } from '../../src/engine/setup';
import { cleanName, cleanOptions, hidden, parseClientMessage, snapshot, withSnapshot } from '../../src/net/protocol';

describe('parseClientMessage', () => {
  it('reads every message type', () => {
    expect(parseClientMessage('{"t":"rooms"}')).toEqual({ t: 'rooms' });
    expect(parseClientMessage('{"t":"join","room":"abcde","name":" Ann "}')).toEqual({ t: 'join', room: 'ABCDE', name: 'Ann' });
    expect(parseClientMessage('{"t":"join","room":"ABCDE","name":"Ann","token":"x"}')).toEqual({ t: 'join', room: 'ABCDE', name: 'Ann', token: 'x' });
    expect(parseClientMessage('{"t":"act","action":{"type":"attack","from":3,"to":7},"i":4}')).toEqual({ t: 'act', action: { type: 'attack', from: 3, to: 7 }, i: 4 });
    expect(parseClientMessage('{"t":"act","action":{"type":"endTurn"}}')).toEqual({ t: 'act', action: { type: 'endTurn' } });
    expect(parseClientMessage('{"t":"turn","attacks":[[1,2],[3,4]]}')).toEqual({ t: 'turn', attacks: [[1, 2], [3, 4]] });
    expect(parseClientMessage('{"t":"create","name":"Ann","options":{"seats":4}}')).toEqual({ t: 'create', name: 'Ann', options: { seats: 4, fill: null, turnSeconds: 60, games: 1 } });
  });

  it('gives null for anything malformed, never throws', () => {
    for (const raw of ['', 'nope', 'null', '[]', '{"t":"fly"}', '{"t":"join","room":"no!"}', '{"t":"act","action":{"type":"attack","from":"3","to":7}}', '{"t":"turn","attacks":[[1]]}', '{"t":"create","name":"   "}']) {
      expect(parseClientMessage(raw)).toBeNull();
    }
  });

  it('cleans names and clamps room options', () => {
    expect(cleanName('a\u0000b\nc')).toBe('abc');
    expect(cleanName('x'.repeat(50))).toHaveLength(20);
    expect(cleanOptions({ seats: 99, games: 0, turnSeconds: -5, fill: 'godlike' })).toEqual({ seats: 8, games: 1, turnSeconds: 0, fill: null });
  });
});

describe('snapshots', () => {
  it('rebuild the state from the public start and the changes alone', () => {
    let state = createGame(makeConfig(defaultSeats(3), 99));
    let seen = hidden(state);
    for (let n = 0; n < 40 && state.winner === null; n++) {
      const attack = legalAttacks(state)[0];
      state = applyAction(state, attack ? { type: 'attack', ...attack } : { type: 'endTurn' }).state;
      seen = withSnapshot(seen, JSON.parse(JSON.stringify(snapshot(state))));
    }
    expect({ ...seen, rngState: state.rngState, config: state.config }).toEqual(state);
    expect([seen.config.seed, seen.rngState]).toEqual([0, 0]);
  });
});
