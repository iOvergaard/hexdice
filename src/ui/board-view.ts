import { DIRS, boardPixelSize, cellCentre, cellCorner, edgeCorners, neighbour } from '../engine/hex';
import type { Point } from '../engine/hex';
import type { Board, GameState, Territory, TerritoryId } from '../engine/types';
import { darken, pipColour, playerColour } from './identity';
import { FRAME_CLIP_ID, LAND_CLIP_ID, buildTerrain } from './terrain';
import { createUnits, unitVariant } from './units';
import type { UnitView } from './units';

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
const TOKEN_TOP = 34;
/** Units are drawn larger than their base art; more so on a rotated board, where the whole map is drawn smaller. */
const UNIT_SCALE = 1.15;
const PORTRAIT_UNIT_SCALE = 1.35;

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
  /** Edges shared with each neighbouring territory (hex steps), keyed by the neighbour's id. */
  shared: Map<TerritoryId, string>;
  centre: Point;
}

interface TerritoryNodes {
  group: SVGGElement;
  fill: SVGPathElement;
  token: SVGGElement;
  units: UnitView;
  diffBorder: SVGPathElement;
  sameBorder: SVGPathElement;
  borderKey: string;
}

function buildGeometry(board: Board, territory: Territory): Geometry {
  const { width, height, cellTerritory } = board;
  const fill: string[] = [];
  const outline: string[] = [];
  const shared = new Map<TerritoryId, string>();
  for (const cell of territory.cells) {
    const centre = cellCentre(cell, width, HEX);
    const corners = Array.from({ length: 6 }, (_, i) => cellCorner(centre, HEX, i));
    fill.push('M' + corners.map((p) => `${n(p.x + PAD)} ${n(p.y + PAD)}`).join('L') + 'Z');
    for (const dir of DIRS) {
      const other = neighbour(cell, dir, width, height);
      if (other !== -1 && cellTerritory[other] === territory.id) continue;
      const [a, b] = edgeCorners(dir);
      const seg = `M${n(corners[a]!.x + PAD)} ${n(corners[a]!.y + PAD)}L${n(corners[b]!.x + PAD)} ${n(corners[b]!.y + PAD)}`;
      outline.push(seg);
      const nt = other === -1 ? -1 : cellTerritory[other]!;
      if (nt !== -1) shared.set(nt, (shared.get(nt) ?? '') + seg);
    }
  }
  const c = cellCentre(territory.centre, width, HEX);
  return { fill: fill.join(''), outline: outline.join(''), shared, centre: { x: c.x + PAD, y: c.y + PAD } };
}

export class BoardView {
  private readonly container: HTMLElement;
  private readonly root: SVGSVGElement;
  private readonly defs: SVGDefsElement;
  private readonly world: SVGGElement;
  private readonly seaLayer: SVGGElement;
  private readonly groundLayer: SVGGElement;
  private readonly landLayer: SVGGElement;
  private readonly overLayer: SVGGElement;
  private readonly hlLayer: SVGGElement;
  // Tokens sit above every fill, border and highlight so neighbours never cover them, and stay upright when the map rotates.
  private readonly tokenLayer: SVGGElement;
  private readonly placeLayer: SVGGElement;
  private readonly variant = unitVariant(typeof location === 'undefined' ? '' : location.search);
  private board: Board | null = null;
  private geometry: Geometry[] = [];
  private nodes: TerritoryNodes[] = [];
  private mapW = 0;
  private mapH = 0;
  /** Land bounds plus a sea margin, in map units: the view zooms to the continent. */
  private crop = { x: 0, y: 0, w: 0, h: 0 };
  /** Where each token is drawn, in view units, after overlapping tokens are nudged apart. */
  private tokenAt: Point[] = [];
  private rotated = false;
  private tapHandler: (territory: TerritoryId | null) => void = () => {};
  private interactive = true;

  constructor(container: HTMLElement) {
    this.container = container;
    this.root = svg('svg', { role: 'group', 'aria-label': 'Game board' }, 'board');
    this.root.dataset.testid = 'board';
    this.root.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    this.defs = svg('defs');
    const hatch = svg('pattern', { id: 'hexdice-hatch', width: 9, height: 9, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    hatch.append(svg('rect', { width: 9, height: 9, fill: 'rgba(255,255,255,0)' }), svg('rect', { width: 4, height: 9, fill: 'rgba(255,255,255,0.55)' }));

    this.world = svg('g', {}, 'world');
    this.seaLayer = svg('g', { 'clip-path': `url(#${FRAME_CLIP_ID})` }, 'layer-sea');
    this.groundLayer = svg('g', { 'clip-path': `url(#${FRAME_CLIP_ID})` }, 'layer-ground');
    this.landLayer = svg('g', { 'clip-path': `url(#${LAND_CLIP_ID})` }, 'layer-land');
    this.overLayer = svg('g', {}, 'layer-over');
    this.hlLayer = svg('g', {}, 'layer-highlight');
    this.world.append(this.seaLayer, this.groundLayer, this.landLayer, this.overLayer, this.hlLayer);
    this.tokenLayer = svg('g', {}, 'layer-tokens');
    this.placeLayer = svg('g', {}, 'layer-placements');
    this.root.append(this.defs, this.world, this.tokenLayer, this.placeLayer);
    this.defs.append(hatch);
    container.append(this.root);

    this.root.addEventListener('pointerup', (e) => {
      if (!e.isPrimary || e.button > 0 || !this.interactive) return;
      const hit = (e.target as Element | null)?.closest<SVGElement>('[data-territory],[data-token-for]');
      this.tapHandler(hit ? Number(hit.dataset.territory ?? hit.dataset.tokenFor) : null);
    });

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.layout()).observe(container);
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
      const identity = state.players[t.owner]?.identity ?? 0;
      const colour = playerColour(identity);
      for (const el of [node.group, node.token]) {
        el.style.setProperty('--c', colour);
        el.style.setProperty('--cd', darken(colour));
        el.style.setProperty('--pip', pipColour(colour));
      }
      node.group.dataset.owner = String(t.owner);
      node.group.dataset.dice = String(t.dice);
      node.group.classList.toggle('is-selected', view.selected === id);
      node.group.classList.toggle('is-target', targets.has(id));
      node.group.classList.toggle('is-attack', view.attack?.from === id || view.attack?.to === id);
      node.group.classList.toggle('is-full', t.dice >= state.config.maxDice);
      for (const cls of ['is-selected', 'is-target', 'is-attack', 'is-full']) {
        node.token.classList.toggle(cls, node.group.classList.contains(cls));
      }
      node.units.update(t.dice, identity);

      const key = t.neighbours.map((nb) => state.territories[nb]!.owner === t.owner ? 's' : 'd').join('');
      if (key !== node.borderKey) {
        let diff = '';
        let same = '';
        for (const nb of t.neighbours) {
          const seg = this.geometry[id]!.shared.get(nb);
          if (!seg) continue;
          if (state.territories[nb]!.owner === t.owner) same += seg;
          else diff += seg;
        }
        node.diffBorder.setAttribute('d', diff);
        node.sameBorder.setAttribute('d', same);
        node.borderKey = key;
      }
    });

    this.renderHighlights(view, targets);
    // Dice counts change token sizes, so overlaps are re-solved on every render.
    this.placeTokens();
  }

  /** Pulses each territory that received dice and floats a "+N" over it. */
  showPlacements(placed: TerritoryId[], durationMs: number): Promise<void> {
    if (durationMs <= 0 || placed.length === 0) return Promise.resolve();
    const counts = new Map<TerritoryId, number>();
    for (const id of placed) counts.set(id, (counts.get(id) ?? 0) + 1);
    const labels: SVGElement[] = [];
    const pulsed: SVGElement[] = [];
    const scale = this.rotated ? PORTRAIT_UNIT_SCALE : UNIT_SCALE;
    for (const [id, count] of counts) {
      const geo = this.geometry[id];
      const node = this.nodes[id];
      if (!geo || !node) continue;
      node.token.classList.add('is-placed');
      pulsed.push(node.token);
      const p = this.tokenAt[id] ?? this.toView(geo.centre);
      const label = svg('text', { x: n(p.x), y: n(p.y - (TOKEN_TOP + 4) * scale), 'text-anchor': 'middle' }, 'placement');
      label.dataset.testid = `placement-${id}`;
      label.style.fontSize = `${n(40 * scale)}px`;
      label.style.setProperty('--dur', `${durationMs}ms`);
      label.textContent = `+${count}`;
      this.placeLayer.append(label);
      labels.push(label);
    }
    return new Promise((resolve) =>
      setTimeout(() => {
        for (const l of labels) l.remove();
        for (const t of pulsed) t.classList.remove('is-placed');
        resolve();
      }, durationMs),
    );
  }

  /** Where a territory's token sits vertically on screen, from 0 (top of the board) to 1 (bottom). */
  verticalPosition(territory: TerritoryId): number {
    const token = this.nodes[territory]?.token.getBoundingClientRect();
    const board = this.root.getBoundingClientRect();
    if (!token || board.height === 0) return 0.5;
    return (token.top + token.height / 2 - board.top) / board.height;
  }

  /** The board half of an elimination: shockwave rings and flying dice in the loser's colour, and a short shake. */
  showBurst(territory: TerritoryId, identity: number, durationMs: number): Promise<void> {
    const geo = this.geometry[territory];
    if (durationMs <= 0 || !geo) return Promise.resolve();
    const p = this.tokenAt[territory] ?? this.toView(geo.centre);
    const burst = svg('g', { transform: `translate(${n(p.x)} ${n(p.y)})` }, 'burst');
    burst.dataset.testid = 'elimination-burst';
    burst.style.setProperty('--c', playerColour(identity));
    burst.style.setProperty('--dur', `${durationMs}ms`);
    burst.append(svg('circle', { r: HEX * 1.4 }, 'burst-flash'));
    for (let i = 0; i < 3; i++) {
      const ring = svg('circle', { r: HEX * 1.2 }, 'burst-ring');
      ring.style.animationDelay = `${i * 140}ms`;
      burst.append(ring);
    }
    // Cosmetic only, so Math.random is fine here.
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const dist = HEX * (4 + Math.random() * 4);
      const die = svg('rect', { x: -6, y: -6, width: 12, height: 12, rx: 3 }, 'burst-die');
      die.style.setProperty('--dx', `${n(Math.cos(angle) * dist)}px`);
      die.style.setProperty('--dy', `${n(Math.sin(angle) * dist)}px`);
      die.style.setProperty('--spin', `${Math.round(Math.random() * 540 - 270)}deg`);
      burst.append(die);
    }
    this.placeLayer.append(burst);
    this.root.classList.remove('is-shaking');
    void this.root.getBoundingClientRect();
    this.root.classList.add('is-shaking');
    return new Promise((resolve) =>
      setTimeout(() => {
        burst.remove();
        this.root.classList.remove('is-shaking');
        resolve();
      }, durationMs),
    );
  }

  /** Floats a red "−N" over a territory whose attack failed. Resolves when the label is gone. */
  showLoss(territory: TerritoryId, lost: number, durationMs: number): Promise<void> {
    const geo = this.geometry[territory];
    if (durationMs <= 0 || lost <= 0 || !geo) return Promise.resolve();
    const scale = this.rotated ? PORTRAIT_UNIT_SCALE : UNIT_SCALE;
    const p = this.tokenAt[territory] ?? this.toView(geo.centre);
    const label = svg('text', { x: n(p.x), y: n(p.y - (TOKEN_TOP + 4) * scale), 'text-anchor': 'middle' }, 'placement is-loss');
    label.dataset.testid = `loss-${territory}`;
    label.style.fontSize = `${n(44 * scale)}px`;
    label.style.setProperty('--dur', `${durationMs}ms`);
    label.textContent = `−${lost}`;
    this.placeLayer.append(label);
    return new Promise((resolve) =>
      setTimeout(() => {
        label.remove();
        resolve();
      }, durationMs),
    );
  }

  /** Map point to view point: the map is rotated a quarter turn clockwise on a portrait container. */
  private toView(p: Point): Point {
    return this.rotated ? { x: this.mapH - p.y, y: p.x } : p;
  }

  /** Portrait container: rotate the map; tokens keep their own orientation. The view zooms to the continent. */
  private layout(): void {
    if (!this.board) return;
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    const rotated = ch > cw && cw > 0;
    this.rotated = rotated;
    const c = this.crop;
    const v = rotated ? { x: this.mapH - c.y - c.h, y: c.x, w: c.h, h: c.w } : { ...c };
    // Grow the crop to the container's shape; past the map frame the board's deep-sea background shows.
    if (cw > 0 && ch > 0) {
      const aspect = cw / ch;
      if (v.w / v.h < aspect) {
        const w = v.h * aspect;
        v.x -= (w - v.w) / 2;
        v.w = w;
      } else {
        const h = v.w / aspect;
        v.y -= (h - v.h) / 2;
        v.h = h;
      }
    }
    this.root.setAttribute('viewBox', `${n(v.x)} ${n(v.y)} ${n(v.w)} ${n(v.h)}`);
    this.world.setAttribute('transform', rotated ? `translate(${this.mapH} 0) rotate(90)` : '');
    this.root.classList.toggle('is-rotated', rotated);
    this.placeTokens();
  }

  /** Puts tokens at their territory centres, then nudges overlapping ones apart (at most ~1.6 hexes). */
  private placeTokens(): void {
    const s = this.rotated ? PORTRAIT_UNIT_SCALE : UNIT_SCALE;
    const pos = this.geometry.map((geo) => this.toView(geo.centre));
    const home = pos.map((p) => ({ ...p }));
    const boxes = this.nodes.map((node) => {
      const b = node.token.firstElementChild instanceof SVGGraphicsElement ? node.token.firstElementChild.getBBox() : null;
      return b && b.width > 0 ? { x: b.x * s, y: b.y * s, w: b.width * s, h: b.height * s } : null;
    });
    const maxShift = HEX * 1.6;
    for (let iter = 0; iter < 24; iter++) {
      let moved = false;
      for (let i = 0; i < pos.length; i++) {
        const a = boxes[i];
        if (!a) continue;
        for (let j = i + 1; j < pos.length; j++) {
          const b = boxes[j];
          if (!b) continue;
          const pi = pos[i]!;
          const pj = pos[j]!;
          const ox = Math.min(pi.x + a.x + a.w, pj.x + b.x + b.w) - Math.max(pi.x + a.x, pj.x + b.x);
          const oy = Math.min(pi.y + a.y + a.h, pj.y + b.y + b.h) - Math.max(pi.y + a.y, pj.y + b.y);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          if (ox < oy) {
            const d = (ox / 2 + 1) * (Math.sign(pj.x + b.x + b.w / 2 - (pi.x + a.x + a.w / 2)) || 1);
            pi.x -= d;
            pj.x += d;
          } else {
            const d = (oy / 2 + 1) * (Math.sign(pj.y + b.y + b.h / 2 - (pi.y + a.y + a.h / 2)) || 1);
            pi.y -= d;
            pj.y += d;
          }
        }
      }
      for (let i = 0; i < pos.length; i++) {
        const p = pos[i]!;
        const h = home[i]!;
        const dist = Math.hypot(p.x - h.x, p.y - h.y);
        if (dist > maxShift) {
          p.x = h.x + ((p.x - h.x) * maxShift) / dist;
          p.y = h.y + ((p.y - h.y) * maxShift) / dist;
        }
      }
      if (!moved) break;
    }
    this.tokenAt = pos;
    pos.forEach((p, id) => this.nodes[id]?.token.setAttribute('transform', `translate(${n(p.x)} ${n(p.y)}) scale(${s})`));
  }

  private build(state: GameState): void {
    const t0 = performance.now();
    const { board } = state;
    this.board = board;
    this.geometry = state.territories.map((t) => buildGeometry(board, t));
    this.nodes = [];
    this.landLayer.replaceChildren();
    this.tokenLayer.replaceChildren();
    this.placeLayer.replaceChildren();
    this.hlLayer.replaceChildren();

    const size = boardPixelSize(board.width, board.height, HEX);
    this.mapW = n(size.width + PAD * 2);
    this.mapH = n(size.height + PAD * 2);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    board.cellTerritory.forEach((t, cell) => {
      if (t === -1) return;
      const c = cellCentre(cell, board.width, HEX);
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    });
    const margin = HEX * 2.4;
    const x0 = Math.max(0, minX + PAD - margin);
    const y0 = Math.max(0, minY + PAD - margin);
    this.crop = { x: x0, y: y0, w: Math.min(this.mapW, maxX + PAD + margin) - x0, h: Math.min(this.mapH, maxY + PAD + margin) - y0 };

    const terrain = buildTerrain(board, state.territories, state.config.seed, HEX, PAD, this.mapW, this.mapH);
    this.defs.replaceChildren(this.defs.querySelector('#hexdice-hatch') ?? document.createComment(''));
    this.defs.insertAdjacentHTML('beforeend', terrain.defs);
    this.seaLayer.innerHTML = terrain.sea;
    this.groundLayer.innerHTML = terrain.ground;
    this.overLayer.innerHTML = terrain.over;

    state.territories.forEach((_t, id) => {
      const geo = this.geometry[id]!;
      const group = svg('g', {}, 'territory');
      group.dataset.territory = String(id);
      group.dataset.testid = `territory-${id}`;
      const fill = svg('path', { d: geo.fill }, 'fill');

      const clip = svg('clipPath', { id: `hd-t-${id}` });
      clip.append(svg('path', { d: geo.fill }));
      this.defs.append(clip);
      const borders = svg('g', { 'clip-path': `url(#hd-t-${id})` }, 'borders');
      const sameBorder = svg('path', {}, 'border-same');
      const diffBorder = svg('path', {}, 'border-diff');
      borders.append(sameBorder, diffBorder);
      group.append(fill, borders);

      const token = svg('g', {}, 'token');
      token.dataset.testid = `token-${id}`;
      token.dataset.tokenFor = String(id);
      const body = svg('g', {}, 'token-body');
      const units = createUnits(this.variant, id);
      body.append(units.root);
      token.append(body);
      this.landLayer.append(group);
      this.tokenLayer.append(token);
      this.nodes.push({ group, fill, token, units, diffBorder, sameBorder, borderKey: '' });
    });
    this.layout();
    this.root.dataset.buildMs = String(Math.round((performance.now() - t0) * 10) / 10);
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
