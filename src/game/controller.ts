import { chooseAction } from '../ai';
import { makeConfig, randomSeed } from '../engine/config';
import { Rng } from '../engine/rng';
import { applyAction, isLegalAttack, largestGroup } from '../engine/rules';
import { defaultSeats } from '../engine/seats';
import { createGame } from '../engine/setup';
import type { Action, AiLevel, GameConfig, GameEvent, GameState, Speed, TerritoryId } from '../engine/types';
import { createGameScreen, showTitle, type GameScreen, type TitleOptions } from '../ui/screens';
import { nextSelection, targetsFor } from '../ui/selection';
import { PAUSE_MS, ROLL_MS } from './timing';
import type { UrlParams } from './url-params';

const TITLE_KEY = 'hexdice:title';
const DEFAULT_TITLE: TitleOptions = { players: 8, aiLevel: 'normal' };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function loadTitle(): TitleOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(TITLE_KEY) ?? 'null') as Partial<TitleOptions> | null;
    if (raw && typeof raw.players === 'number' && (raw.aiLevel === 'easy' || raw.aiLevel === 'normal')) {
      return { players: raw.players, aiLevel: raw.aiLevel };
    }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return { ...DEFAULT_TITLE };
}

function saveTitle(opts: TitleOptions): void {
  try {
    localStorage.setItem(TITLE_KEY, JSON.stringify(opts));
  } catch {
    // Ignore: remembering the choice is a convenience.
  }
}

/** Owns the game state and runs one action at a time; events animate in order before the next action. */
export class Controller {
  private screen: GameScreen | null = null;
  private state: GameState | null = null;
  private config: GameConfig | null = null;
  private actionLog: Action[] = [];
  private eventLog: GameEvent[] = [];
  private aiRng = new Rng(0);
  private speed: Speed;
  private mode: 'play' | 'replay' = 'play';
  private busy = false;
  private paused = false;
  private autoplay = false;
  private replayable = true;
  private selected: TerritoryId | null = null;
  /** Bumped whenever the running game is abandoned (quit, replay, load); stale async work bails out. */
  private gen = 0;
  private running = -1;

  constructor(
    private readonly root: HTMLElement,
    private readonly params: UrlParams,
  ) {
    this.speed = params.speed ?? 'normal';
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  start(): void {
    if (this.params.seed !== null || this.params.players !== null) {
      const stored = loadTitle();
      const opts = { players: this.params.players ?? stored.players, aiLevel: this.params.aiLevel ?? stored.aiLevel };
      this.newGame(opts, this.params.seed ?? randomSeed());
      this.begin();
    } else {
      this.toTitle();
    }
  }

  // ---- debug / test surface ----
  getState(): GameState | null {
    return this.state;
  }
  getActions(): readonly Action[] {
    return this.actionLog;
  }
  getEvents(): readonly GameEvent[] {
    return this.eventLog;
  }
  attack(from: TerritoryId, to: TerritoryId): Promise<void> {
    if (!this.canAct() || !this.state || !isLegalAttack(this.state, from, to)) return Promise.reject(new Error('Attack not allowed now'));
    return this.submit({ type: 'attack', from, to });
  }
  endTurn(): Promise<void> {
    if (!this.canAct()) return Promise.reject(new Error('Cannot end turn now'));
    return this.submit({ type: 'endTurn' });
  }
  setAutoplay(on: boolean): void {
    this.autoplay = on;
    this.kick();
  }
  load(state: GameState): void {
    this.gen++;
    this.config = state.config;
    this.state = state;
    this.actionLog = [];
    this.eventLog = [];
    this.replayable = false;
    this.aiRng = new Rng(state.rngState ^ 0x9e3779b9);
    this.paused = false;
    this.watching = false;
    this.mode = 'play';
    this.busy = false;
    this.selected = null;
    if (!this.screen) this.screen = this.setupScreen();
    this.screen.overlay.hide();
    this.screen.preview.hide();
    this.screen.roll.clear();
    this.renderAll();
    this.kick();
  }
  async idle(): Promise<void> {
    while (!this.state || this.busy || this.mode !== 'play' || !(this.state.winner !== null || this.paused || this.isHumanTurn())) {
      await sleep(10);
    }
  }

  // ---- screen flow ----
  private toTitle(): void {
    this.gen++;
    this.busy = false;
    this.screen = null;
    this.state = null;
    showTitle(this.root, loadTitle(), (opts) => {
      saveTitle(opts);
      this.newGame(opts, randomSeed());
      this.preview(opts);
    });
  }

  private newGame(opts: TitleOptions, seed: number): void {
    this.gen++;
    this.config = makeConfig(defaultSeats(opts.players - 1, opts.aiLevel), seed);
    this.state = createGame(this.config);
    this.actionLog = [];
    this.eventLog = [];
    this.replayable = true;
    this.paused = false;
    this.watching = false;
    this.mode = 'play';
    this.busy = false;
    this.selected = null;
    this.aiRng = new Rng(this.config.seed ^ 0x9e3779b9);
    this.screen = this.setupScreen();
  }

  private preview(opts: TitleOptions): void {
    const screen = this.screen!;
    const show = (): void => {
      this.renderBoard(false);
      screen.preview.show(this.config!.seed, {
        onYes: () => {
          screen.preview.hide();
          this.begin();
        },
        onNo: () => {
          this.newGame(opts, randomSeed());
          this.preview(opts);
        },
      });
    };
    show();
  }

  private begin(): void {
    this.renderAll();
    this.kick();
  }

  private setupScreen(): GameScreen {
    const screen = createGameScreen(this.root);
    screen.board.onTap((t) => this.onTap(t));
    screen.hud.onEndTurn(() => {
      if (this.canAct()) void this.submit({ type: 'endTurn' });
    });
    screen.hud.onSpeedChange((s) => {
      this.speed = s;
    });
    screen.hud.onQuit(() => this.toTitle());
    return screen;
  }

  // ---- rendering ----
  private humans(): number {
    return this.state ? this.state.players.filter((p) => p.kind === 'human').length : 0;
  }

  private isHumanTurn(): boolean {
    const s = this.state!;
    return !this.autoplay && s.winner === null && s.players[s.current]!.kind === 'human';
  }

  private canAct(): boolean {
    return !!this.state && !this.busy && !this.paused && this.mode === 'play' && this.isHumanTurn();
  }

  private canAttack = (from: TerritoryId, to: TerritoryId): boolean => isLegalAttack(this.state!, from, to);

  private renderBoard(interactive: boolean, attack: { from: TerritoryId; to: TerritoryId } | null = null, state = this.state!): void {
    this.screen!.board.render(state, {
      selected: this.selected,
      targets: this.selected === null ? [] : targetsFor(state, this.selected, this.canAttack),
      attack,
      interactive,
    });
  }

  private renderAll(): void {
    const s = this.state!;
    const interactive = this.canAct();
    this.renderBoard(interactive);
    this.screen!.hud.render(s, {
      largestGroups: s.players.map((p) => (p.alive ? largestGroup(s, p.id) : 0)),
      canEndTurn: interactive,
      speed: this.speed,
      mode: this.mode,
    });
  }

  // ---- input ----
  private onTap(tapped: TerritoryId | null): void {
    if (!this.canAct()) return;
    const next = nextSelection(this.state!, this.selected, tapped, this.canAttack);
    this.selected = next.selected;
    if (next.attack) void this.submit({ type: 'attack', from: next.attack.from, to: next.attack.to });
    else this.renderAll();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.canAct() && this.selected !== null) {
        this.selected = null;
        this.renderAll();
      }
    } else if (e.key === ' ' || e.code === 'Space') {
      const t = e.target as HTMLElement | null;
      if (t && /^(BUTTON|SELECT|INPUT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault();
      if (this.canAct()) void this.submit({ type: 'endTurn' });
    }
  }

  // ---- turn flow ----
  /** Human action. Busy is set synchronously, so a second tap in the same tick is ignored. */
  private async submit(action: Action): Promise<void> {
    const gen = this.gen;
    this.busy = true;
    this.selected = null;
    this.renderAll();
    await this.play(action, gen, this.speed, true);
    if (gen !== this.gen) return;
    this.busy = false;
    this.kick();
  }

  private async play(action: Action, gen: number, speed: Speed, record: boolean): Promise<void> {
    const before = this.state!;
    const { state: next, events } = applyAction(before, action);
    if (record) {
      this.actionLog.push(action);
      this.eventLog.push(...events);
    }
    const roll = events.find((e) => e.type === 'attackRolled');
    if (roll) {
      this.renderBoard(false, { from: roll.from, to: roll.to }, before);
      await this.screen!.roll.show(roll, before, ROLL_MS[speed]);
      if (gen !== this.gen) return;
    }
    this.state = next;
    this.renderAll();
    if (record && !this.watching && !this.autoplay && this.humansAllOut(events)) {
      this.paused = true;
      this.renderAll();
      this.screen!.overlay.show(this.humans() === 1 ? 'You were eliminated' : 'All human players were eliminated', {
        onTitle: () => this.toTitle(),
        onReplay: null,
        onWatch: () => {
          this.watching = true;
          this.paused = false;
          this.screen!.overlay.hide();
          this.renderAll();
          this.kick();
        },
      });
    }
  }

  private watching = false;

  private humansAllOut(events: GameEvent[]): boolean {
    const s = this.state!;
    return (
      s.winner === null &&
      this.humans() > 0 &&
      events.some((e) => e.type === 'playerEliminated') &&
      s.players.every((p) => p.kind !== 'human' || !p.alive)
    );
  }

  private kick(): void {
    if (this.running === this.gen || !this.state) return;
    void this.loop(this.gen);
  }

  private async loop(gen: number): Promise<void> {
    this.running = gen;
    try {
      while (gen === this.gen) {
        const s = this.state!;
        if (s.winner !== null) {
          this.finishGame();
          return;
        }
        if (this.paused) return;
        if (this.isHumanTurn()) {
          this.busy = false;
          this.renderAll();
          return;
        }
        this.busy = true;
        this.renderAll();
        await sleep(PAUSE_MS[this.speed]);
        if (gen !== this.gen) return;
        const level: AiLevel = s.players[s.current]!.aiLevel ?? 'normal';
        await this.play(chooseAction(s, level, this.aiRng), gen, this.speed, true);
        if (gen === this.gen && this.paused) {
          this.busy = false;
          return;
        }
      }
    } finally {
      if (this.running === gen) this.running = -1;
    }
  }

  // ---- end of game and replay ----
  private finishGame(): void {
    this.busy = false;
    this.mode = 'play';
    this.renderAll();
    const s = this.state!;
    const winner = s.players[s.winner!]!;
    const title = this.humans() === 1 && winner.kind === 'human' ? 'You win' : `${winner.name} wins`;
    this.screen!.overlay.show(title, {
      onTitle: () => this.toTitle(),
      onReplay: this.replayable ? () => void this.replay() : null,
      onWatch: null,
    });
  }

  private async replay(): Promise<void> {
    const gen = ++this.gen;
    const log = [...this.actionLog];
    const screen = this.screen!;
    screen.overlay.hide();
    screen.roll.clear();
    this.mode = 'replay';
    this.busy = true;
    this.selected = null;
    this.state = createGame(this.config!);
    this.renderAll();
    const pace: Speed = this.speed === 'instant' ? 'instant' : 'fast';
    for (const action of log) {
      await sleep(PAUSE_MS[pace]);
      if (gen !== this.gen) return;
      await this.play(action, gen, pace, false);
      if (gen !== this.gen) return;
    }
    this.finishGame();
  }
}
