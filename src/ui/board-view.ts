import { DIRS, boardPixelSize, cellCentre, cellCorner, edgeCorners, neighbour } from '../engine/hex';
import type { Point } from '../engine/hex';
import type { Board, GameState, Territory, TerritoryId } from '../engine/types';
import { emblemPath, playerColour } from './identity';

export interface BoardViewState {
  selected: TerritoryId | null;
  targets: TerritoryId[];
  attack: { from: TerritoryId; to: TerritoryId } | null;
  interactive: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Hex radius in SVG units; the viewBox scales the board to its container. */
const HEX = 20;
const PAD = 10;
const TOKEN_W = 66;
const TOKEN_H = 42;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, cls?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (cls) el.setAttribute('class', cls);
  return el;
}

const n = (v: number) => Math.round(v * 10) / 10;

interface Geometry {
  fill: string;
  outline: string;
  centre: Point;
}

interface TerritoryNodes {
  group: SVGGElement;
  fill: SVGPathElement;
  token: SVGGElement;
  emblem: SVGPathElement;
  count: SVGTextElement;
  emblemIdentity: number;
}

function buildGeometry(board: Board, territory: Territory): Geometry {
  const { width, height, cellTerritory } = board;
  const fill: string[] = [];
  const outline: string[] = [];
  for (const cell of territory.cells) {
    const centre = cellCentre(cell, width, HEX);
    const corners = Array.from({ length: 6 }, (_, i) => cellCorner(centre, HEX, i));
    fill.push('M' + corners.map((p) => `${n(p.x + PAD)} ${n(p.y + PAD)}`).join('L') + 'Z');
    for (const dir of DIRS) {
      const other = neighbour(cell, dir, width, height);
      if (other !== -1 && cellTerritory[other] === territory.id) continue;
      const [a, b] = edgeCorners(dir);
      outline.push(`M${n(corners[a]!.x + PAD)} ${n(corners[a]!.y + PAD)}L${n(corners[b]!.x + PAD)} ${n(corners[b]!.y + PAD)}`);
    }
  }
  const c = cellCentre(territory.centre, width, HEX);
  return { fill: fill.join(''), outline: outline.join(''), centre: { x: c.x + PAD, y: c.y + PAD } };
}

export class BoardView {
  private readonly root: SVGSVGElement;
  private readonly landLayer: SVGGElement;
  private readonly lineLayer: SVGGElement;
  private readonly hlLayer: SVGGElement;
  // Tokens sit above every fill, outline and highlight so neighbours never cover them.
  private readonly tokenLayer: SVGGElement;
  private board: Board | null = null;
  private geometry: Geometry[] = [];
  private nodes: TerritoryNodes[] = [];
  private tapHandler: (territory: TerritoryId | null) => void = () => {};
  private interactive = true;

  constructor(container: HTMLElement) {
    this.root = svg('svg', { role: 'group', 'aria-label': 'Game board' }, 'board');
    this.root.dataset.testid = 'board';
    this.root.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const defs = svg('defs');
    const hatch = svg('pattern', { id: 'hexdice-hatch', width: 9, height: 9, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    hatch.append(svg('rect', { width: 9, height: 9, fill: 'rgba(255,255,255,0)' }), svg('rect', { width: 4, height: 9, fill: 'rgba(255,255,255,0.55)' }));
    defs.append(hatch);

    this.landLayer = svg('g', {}, 'layer-land');
    this.lineLayer = svg('g', {}, 'layer-lines');
    this.hlLayer = svg('g', {}, 'layer-highlight');
    this.tokenLayer = svg('g', {}, 'layer-tokens');
    this.root.append(defs, this.landLayer, this.lineLayer, this.hlLayer, this.tokenLayer);
    container.append(this.root);

    this.root.addEventListener('pointerup', (e) => {
      if (!e.isPrimary || e.button > 0 || !this.interactive) return;
      const hit = (e.target as Element | null)?.closest<SVGElement>('[data-territory],[data-token-for]');
      this.tapHandler(hit ? Number(hit.dataset.territory ?? hit.dataset.tokenFor) : null);
    });
  }

  onTap(handler: (territory: TerritoryId | null) => void): void {
    this.tapHandler = handler;
  }

  render(state: GameState, view: BoardViewState): void {
    if (this.board !== state.board) this.build(state);
    this.interactive = view.interactive;

    const targets = new Set(view.targets);
    this.root.classList.toggle('is-locked', !view.interactive);
    this.root.classList.toggle('has-selection', view.selected !== null);
    this.root.classList.toggle('has-attack', view.attack !== null);

    state.territories.forEach((t, id) => {
      const node = this.nodes[id]!;
      const colour = playerColour(state.players[t.owner]?.identity ?? 0);
      const identity = state.players[t.owner]?.identity ?? 0;
      node.group.style.setProperty('--c', colour);
      node.group.dataset.owner = String(t.owner);
      node.group.dataset.dice = String(t.dice);
      node.group.classList.toggle('is-selected', view.selected === id);
      node.group.classList.toggle('is-target', targets.has(id));
      node.group.classList.toggle('is-attack', view.attack?.from === id || view.attack?.to === id);
      node.group.classList.toggle('is-full', t.dice >= state.config.maxDice);
      node.token.style.setProperty('--c', colour);
      for (const cls of ['is-selected', 'is-target', 'is-attack', 'is-full']) {
        node.token.classList.toggle(cls, node.group.classList.contains(cls));
      }
      if (node.emblemIdentity !== identity) {
        node.emblem.setAttribute('d', emblemPath(identity, 9));
        node.emblemIdentity = identity;
      }
      node.count.textContent = String(t.dice);
    });

    this.renderHighlights(view, targets);
  }

  private build(state: GameState): void {
    const { board } = state;
    this.board = board;
    this.geometry = state.territories.map((t) => buildGeometry(board, t));
    this.nodes = [];
    this.landLayer.replaceChildren();
    this.lineLayer.replaceChildren();
    this.tokenLayer.replaceChildren();

    const size = boardPixelSize(board.width, board.height, HEX);
    const w = n(size.width + PAD * 2);
    const h = n(size.height + PAD * 2);
    this.root.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.root.replaceChildren(...Array.from(this.root.children).filter((c) => c.tagName === 'defs'));
    this.root.append(svg('rect', { x: 0, y: 0, width: w, height: h, rx: 16 }, 'sea'), this.landLayer, this.lineLayer, this.hlLayer, this.tokenLayer);

    state.territories.forEach((_t, id) => {
      const geo = this.geometry[id]!;
      const group = svg('g', {}, 'territory');
      group.dataset.territory = String(id);
      group.dataset.testid = `territory-${id}`;
      const fill = svg('path', { d: geo.fill }, 'fill');

      const token = svg('g', { transform: `translate(${n(geo.centre.x)} ${n(geo.centre.y)})` }, 'token');
      token.dataset.testid = `token-${id}`;
      token.dataset.tokenFor = String(id);
      const body = svg('g', {}, 'token-body');
      body.append(
        svg('rect', { x: -TOKEN_W / 2, y: -TOKEN_H / 2, width: TOKEN_W, height: TOKEN_H, rx: 13 }, 'token-plate'),
      );
      const emblem = svg('path', { transform: 'translate(-20 0)' }, 'token-emblem');
      const count = svg('text', { x: 14, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'token-count');
      body.append(emblem, count);
      token.append(body);
      group.append(fill);
      this.landLayer.append(group);
      this.tokenLayer.append(token);

      this.lineLayer.append(svg('path', { d: geo.outline }, 'outline'));
      this.nodes.push({ group, fill, token, emblem, count, emblemIdentity: -1 });
    });
  }

  private renderHighlights(view: BoardViewState, targets: Set<TerritoryId>): void {
    this.hlLayer.replaceChildren();
    const add = (id: TerritoryId, kind: 'selected' | 'target' | 'from' | 'to') => {
      const geo = this.geometry[id];
      if (!geo) return;
      const g = svg('g', {}, `hl hl-${kind}`);
      if (kind === 'target' || kind === 'to') g.append(svg('path', { d: geo.fill }, 'hl-hatch'));
      g.append(svg('path', { d: geo.outline }, 'hl-halo'), svg('path', { d: geo.outline }, 'hl-line'));
      this.hlLayer.append(g);
    };

    for (const id of targets) add(id, 'target');
    if (view.selected !== null) add(view.selected, 'selected');
    if (view.attack) {
      add(view.attack.to, 'to');
      add(view.attack.from, 'from');
      const a = this.geometry[view.attack.from]?.centre;
      const b = this.geometry[view.attack.to]?.centre;
      if (a && b) this.hlLayer.append(this.arrow(a, b));
    }
  }

  private arrow(a: Point, b: Point): SVGGElement {
    const g = svg('g', {}, 'attack-arrow');
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Start and end just outside the dice tokens.
    const gap = Math.min(30, len * 0.3);
    const start = { x: a.x + ux * gap, y: a.y + uy * gap * 0.8 };
    const end = { x: b.x - ux * gap, y: b.y - uy * gap * 0.8 };
    const head = 13;
    const px = -uy;
    const py = ux;
    g.append(
      svg('path', { d: `M${n(start.x)} ${n(start.y)}L${n(end.x)} ${n(end.y)}` }, 'arrow-halo'),
      svg('path', { d: `M${n(start.x)} ${n(start.y)}L${n(end.x)} ${n(end.y)}` }, 'arrow-line'),
      svg(
        'path',
        {
          d: `M${n(end.x + ux * 6)} ${n(end.y + uy * 6)}L${n(end.x - ux * head + px * head * 0.7)} ${n(end.y - uy * head + py * head * 0.7)}L${n(end.x - ux * head - px * head * 0.7)} ${n(end.y - uy * head - py * head * 0.7)}Z`,
        },
        'arrow-head',
      ),
    );
    return g;
  }
}
