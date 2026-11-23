// The end-of-game card: the winner's colour and emblem lead, then the territories held over the game.
import type { PlayerId } from '../engine/types';
import type { GameSummary, Standing } from '../game/summary';
import { ordinal } from '../game/summary';
import { emblemPath, pipColour, playerColour } from './identity';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface EndingPlayer {
  name: string;
  identity: number;
}

/** 'won': a human won. 'lost': an AI won. 'out': every human is out and play goes on. */
export type Mood = 'won' | 'lost' | 'out';

export interface Ending {
  title: string;
  mood: Mood;
  summary: GameSummary;
  /** Indexed by player id. */
  players: EndingPlayer[];
  /** The single human player, or null with none or several. */
  you: PlayerId | null;
  territories: number;
}

/** A won attack below this chance counts as luck worth mentioning. */
const LUCKY = 0.35;

const rounds = (n: number): string => `${n} ${n === 1 ? 'round' : 'rounds'}`;
const territories = (n: number): string => `${n} ${n === 1 ? 'territory' : 'territories'}`;

function nameOf(e: Ending, id: PlayerId): string {
  return id === e.you ? 'You' : e.players[id]!.name;
}

function standing(e: Ending, id: PlayerId): Standing {
  return e.summary.standings.find((s) => s.player === id)!;
}

function list(names: string[]): string {
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** Whose colour and emblem lead the card: the winner, else you, else whoever holds the most now. */
export function leadOf(e: Ending): PlayerId {
  if (e.summary.winner !== null) return e.summary.winner;
  if (e.you !== null) return e.you;
  return e.summary.standings[0]!.player;
}

/** The highlights of a winner's game, best first. */
function highlights(e: Ending, id: PlayerId): string[] {
  const lines: string[] = [];
  const big = e.summary.bigTurns[id];
  if (big && big.captures >= 3) lines.push(`Biggest turn: ${territories(big.captures)} in round ${big.round}.`);
  const out = e.summary.standings.filter((s) => s.outBy === id).map((s) => nameOf(e, s.player));
  if (out.length > 0) lines.push(`${id === e.you ? 'You' : e.players[id]!.name} knocked out ${list(out)}.`);
  const upset = e.summary.upsets[id];
  if (upset && upset.chance < LUCKY) {
    lines.push(`Luckiest win: ${upset.attackDice} dice beat ${upset.defendDice} in round ${upset.round}, a ${Math.round(upset.chance * 100)}% chance.`);
  }
  return lines;
}

/** How your game went once you're out: how big you got, and who finished you. */
function yourRun(e: Ending, you: Standing): string {
  const start = e.summary.timeline[0]!.counts[you.player]!;
  const peak = you.peak > start ? `You held up to ${territories(you.peak)} in round ${you.peakRound}.` : `You started with ${territories(start)}.`;
  if (you.outRound === null || you.outBy === null) return peak;
  return `${peak} ${nameOf(e, you.outBy)} took your last one in round ${you.outRound}.`;
}

/** The line under the title and the caption under the chart. Pure, so it's tested without a DOM. */
export function endingCopy(e: Ending): { sub: string; caption: string } {
  const all = `all ${e.territories} territories in ${rounds(e.summary.rounds)}`;
  const you = e.you === null ? null : standing(e, e.you);
  const place = you?.place ? `You came ${ordinal(you.place)} of ${e.summary.players}.` : '';
  if (e.mood === 'out') {
    return { sub: place || 'Play goes on without you.', caption: you ? yourRun(e, you) : '' };
  }
  const winner = e.summary.winner!;
  const sub = `${winner === e.you ? 'You took' : `${e.players[winner]!.name} took`} ${all}.`;
  if (you && you.player !== winner) return { sub, caption: `${yourRun(e, you)} ${place}` };
  return { sub, caption: highlights(e, winner).slice(0, 2).join(' ') };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export const CHART_W = 400;
export const CHART_H = 150;
/** Room above the chart for the knockout marks. */
export const LANE = 18;

export interface ChartShapes {
  /** Bottom band first: the winner, then the rest in finishing order. */
  bands: { d: string; fill: string }[];
  /** Your band's outline, drawn on top so a thin band still reads; null without a single human. */
  yours: string | null;
  /** A knockout mark above the chart for each player who went out. */
  marks: { x: number; identity: number; label: string }[];
}

/** The chart's geometry in a CHART_W by CHART_H box (the marks sit above it, in LANE). Pure, so the picture draws the same chart. */
export function chartShapes(e: Ending): ChartShapes {
  const t = e.summary.timeline;
  const x = (k: number): number => (t.length === 1 ? 0 : (k / (t.length - 1)) * CHART_W);
  const y = (v: number): number => CHART_H - (v / e.territories) * CHART_H;
  const bands: ChartShapes['bands'] = [];
  const below = t.map(() => 0);
  let yours: string | null = null;
  for (const st of e.summary.standings) {
    const top = t.map((sample, k) => below[k]! + sample.counts[st.player]!);
    if (top.every((v, k) => v === below[k])) continue;
    const up = top.map((v, k) => `${k === 0 ? 'M' : 'L'}${x(k).toFixed(1)} ${y(v).toFixed(1)}`);
    const down = below.map((v, k) => `L${x(k).toFixed(1)} ${y(v).toFixed(1)}`).reverse();
    const d = `${up.join(' ')} ${down.join(' ')} Z`;
    bands.push({ d, fill: playerColour(e.players[st.player]!.identity) });
    if (st.player === e.you) yours = d;
    top.forEach((v, k) => (below[k] = v));
  }
  const marks: ChartShapes['marks'] = [];
  for (const st of e.summary.standings) {
    if (st.outRound === null) continue;
    const k = t.findIndex((sample, i) => i > 0 && sample.counts[st.player] === 0);
    if (k < 0) continue;
    // Marks that would touch shift left, so knockouts in the same turn stay apart.
    let px = Math.min(CHART_W - 8, Math.max(8, x(k)));
    while (marks.some((m) => Math.abs(m.x - px) < 15)) px -= 15;
    marks.push({ x: px, identity: e.players[st.player]!.identity, label: `${nameOf(e, st.player)}, out in round ${st.outRound}` });
  }
  return { bands, yours, marks };
}

/** Territories held per turn, stacked in finishing order with the winner at the bottom: it fills the box as they take the map. */
function chart(e: Ending): SVGSVGElement {
  const s = svg('svg', { viewBox: `0 ${-LANE} ${CHART_W} ${CHART_H + LANE}`, class: 'end-chart', role: 'img' });
  s.dataset.testid = 'ending-chart';
  s.setAttribute('aria-label', `Territories each player held over ${rounds(e.summary.rounds)}`);
  const shapes = chartShapes(e);
  const bands = svg('g');
  for (const b of shapes.bands) bands.append(svg('path', { d: b.d, fill: b.fill, class: 'end-band' }));
  if (shapes.yours) bands.append(svg('path', { d: shapes.yours, class: 'end-band-you' }));
  s.append(bands);
  const lane = svg('g');
  for (const m of shapes.marks) {
    const g = svg('g', { transform: `translate(${m.x.toFixed(1)} ${-LANE / 2})`, class: 'end-out' });
    const title = svg('title');
    title.textContent = m.label;
    g.append(title, svg('line', { x1: 0, y1: 7, x2: 0, y2: LANE / 2 + 3, class: 'end-tick' }), svg('path', { d: emblemPath(m.identity, 6.5), fill: playerColour(m.identity) }));
    lane.append(g);
  }
  s.append(lane);
  return s;
}

export interface ScoreRow {
  player: PlayerId;
  place: string;
  name: string;
  identity: number;
  out: string;
  attacks: string;
  defences: string;
  you: boolean;
}

export const SCORE_HEADINGS = ['', 'Player', 'Out', 'Attacks', 'Defences'] as const;
export const SCORE_NOTE = 'Attacks: won of made. Defences: held of faced.';

/** The scoreboard's rows in finishing order. Pure, so the picture shows the same table. */
export function scoreRows(e: Ending): ScoreRow[] {
  return e.summary.standings.map((st) => ({
    player: st.player,
    place: st.place !== null ? ordinal(st.place) : '',
    name: nameOf(e, st.player),
    identity: e.players[st.player]!.identity,
    out: st.outRound !== null ? `Round ${st.outRound}` : st.player === e.summary.winner ? 'Winner' : st.place !== null ? 'Still in' : 'Earlier',
    attacks: `${st.attacksWon}/${st.attacks}`,
    defences: `${st.defencesHeld}/${st.defences}`,
    you: st.player === e.you,
  }));
}

/** Every player in finishing order: when they went out, and their attacks and defences. */
function scoreboard(e: Ending): HTMLElement {
  const table = el('table', 'end-board');
  table.dataset.testid = 'scoreboard';
  const head = el('tr');
  const classes = ['board-place', 'board-player', 'board-out', 'board-num', 'board-num'];
  SCORE_HEADINGS.forEach((label, i) => head.append(el('th', classes[i], label)));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const r of scoreRows(e)) {
    const row = el('tr', r.you ? 'is-you' : undefined);
    row.dataset.testid = `scoreboard-${r.player}`;
    const who = el('td', 'board-player');
    const badge = el('span', 'board-badge');
    badge.style.setProperty('--c', playerColour(r.identity));
    const mark = svg('svg', { viewBox: '-12 -12 24 24', 'aria-hidden': 'true' });
    mark.append(svg('path', { d: emblemPath(r.identity, 10) }));
    badge.append(mark);
    const inner = el('span', 'board-who');
    inner.append(badge, r.name);
    who.append(inner);
    row.append(
      el('td', 'board-place', r.place),
      who,
      el('td', 'board-out', r.out),
      el('td', 'board-num board-attacks', r.attacks),
      el('td', 'board-num board-defences', r.defences),
    );
    tbody.append(row);
  }
  table.append(thead, tbody);
  const wrap = el('div', 'end-scores');
  wrap.append(table, el('p', 'end-note', SCORE_NOTE));
  return wrap;
}

/** The card's content; the overlay adds the buttons. */
export function renderEnding(e: Ending): HTMLElement {
  const lead = e.players[leadOf(e)]!;
  const colour = playerColour(lead.identity);
  const copy = endingCopy(e);
  const card = el('section', 'end-card');
  card.style.setProperty('--c', colour);
  card.style.setProperty('--on-c', pipColour(colour));

  const head = el('header', 'end-head');
  const mark = svg('svg', { viewBox: '-12 -12 24 24', class: 'end-emblem', 'aria-hidden': 'true' });
  mark.append(svg('path', { d: emblemPath(lead.identity, 10.5) }));
  const h = el('h2', 'end-title', e.title);
  h.id = 'overlay-heading';
  h.dataset.testid = 'overlay-heading';
  const sub = el('p', 'end-sub', copy.sub);
  sub.dataset.testid = 'ending-sub';
  head.append(mark, h, sub);

  const figure = el('figure', 'end-figure');
  const axis = el('figcaption', 'end-axis');
  axis.append(el('span', '', `Round ${e.summary.timeline[0]!.round}`), el('span', '', 'Territories held'), el('span', '', `Round ${e.summary.rounds}`));
  figure.append(chart(e), axis);

  card.append(head, figure);
  if (copy.caption) {
    const caption = el('p', 'end-caption', copy.caption);
    caption.dataset.testid = 'ending-caption';
    card.append(caption);
  }
  card.append(scoreboard(e));
  return card;
}
