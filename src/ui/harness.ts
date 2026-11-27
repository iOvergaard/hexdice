// Dev-only page for looking at the UI components on a fixture board, without the engine rules or controller.
// ?seed=&players=  ?roll=1 (&dice=8x8)  ?overlay=1  ?preview=1  ?title=1  (&tumble=1 keeps the roll animation)
import '../style.css';
import { fixtureBoardState } from '../../tests/fixtures/state';
import type { AttackRolledEvent, GameState, TerritoryId } from '../engine/types';
import { summarise } from '../game/summary';
import type { Ending } from './ending';
import { createGameScreen, showTitle } from './screens';
import { nextSelection, targetsFor } from './selection';

const params = new URLSearchParams(location.search);
const root = document.querySelector<HTMLElement>('#app')!;

if (params.has('title')) {
  const scene = () => fixtureBoardState(Number(params.get('seed') ?? 2026), 6);
  showTitle(root, { players: Number(params.get('players') ?? 8), aiLevel: 'normal' }, () => {}, undefined, undefined, undefined, undefined, scene);
} else {
  start();
}

function start(): void {
  const seed = Number(params.get('seed') ?? 7);
  const players = Number(params.get('players') ?? 8);
  const state: GameState = fixtureBoardState(seed, players);
  const screen = createGameScreen(root);

  // Stand-in for the engine's legality check.
  const canAttack = (from: TerritoryId, to: TerritoryId): boolean => {
    const f = state.territories[from]!;
    const t = state.territories[to]!;
    return f.owner === state.current && t.owner !== f.owner && f.neighbours.includes(to) && f.dice >= 2;
  };

  let selected: TerritoryId | null = null;
  let attack: { from: TerritoryId; to: TerritoryId } | null = null;

  const groups = state.players.map((p) => state.territories.filter((t) => t.owner === p.id).length);
  const paint = () => {
    screen.board.render(state, {
      selected,
      targets: selected === null ? [] : targetsFor(state, selected, canAttack),
      attack,
      interactive: true,
    });
    screen.hud.render(state, { largestGroups: groups, gangedUpOn: new Set(), canEndTurn: true, skip: null, speed: 'normal', mode: 'play', sound: false, music: false });
  };

  const sampleAttack = (): { from: TerritoryId; to: TerritoryId } => {
    for (const t of state.territories) {
      if (t.owner !== state.current || t.dice < 2) continue;
      const to = t.neighbours.find((n) => state.territories[n]!.owner !== state.current);
      if (to !== undefined) return { from: t.id, to };
    }
    return { from: 0, to: state.territories[0]!.neighbours[0] ?? 1 };
  };

  // ?dice=8x8 rolls that many dice a side (attacker x defender), every face shown.
  const [att, def] = (params.get('dice') ?? '').split('x').map(Number);
  const faces = (n: number, from: number) => Array.from({ length: n }, (_, i) => ((i + from) % 6) + 1);
  const attackRolls = att ? faces(att, 4) : [5, 3, 6, 2];
  const defendRolls = def ? faces(def, 0) : [4, 3, 5];
  const sum = (rolls: number[]) => rolls.reduce((a, b) => a + b, 0);

  const showRoll = (pair: { from: TerritoryId; to: TerritoryId }, ms: number) => {
    const event: AttackRolledEvent = {
      type: 'attackRolled',
      attacker: state.current,
      defender: state.territories[pair.to]!.owner,
      from: pair.from,
      to: pair.to,
      attackRolls,
      defendRolls,
      attackSum: sum(attackRolls),
      defendSum: sum(defendRolls),
      success: sum(attackRolls) > sum(defendRolls),
    };
    return screen.roll.show(event, state, ms);
  };

  screen.board.onTap((tapped) => {
    const next = nextSelection(state, selected, tapped, canAttack);
    selected = next.selected;
    attack = next.attack;
    if (next.attack) void showRoll(next.attack, 600);
    paint();
  });

  if (params.has('roll')) {
    attack = sampleAttack();
    void showRoll(attack, params.has('tumble') ? 1600 : 0);
  }
  if (params.has('preview')) screen.preview.show(seed, { onYes: () => screen.preview.hide(), onNo: () => screen.preview.hide() });
  if (params.has('overlay')) {
    const you = state.players.find((p) => p.kind === 'human')?.id ?? 0;
    const ending: Ending = {
      title: 'You were eliminated',
      mood: 'out',
      summary: summarise(state, [], state),
      players: state.players.map((p) => ({ name: p.name, identity: p.identity })),
      you,
      territories: state.territories.length,
    };
    screen.overlay.show(ending, { onTitle: () => {}, onReplay: () => {}, onWatch: () => {} });
  }
  paint();
}
