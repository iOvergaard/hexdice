import { chooseAction } from '../ai';
import { makeConfig, randomSeed } from '../engine/config';
import { Rng } from '../engine/rng';
import { applyAction, isLegalAttack, largestGroup } from '../engine/rules';
import { defaultSeats } from '../engine/seats';
import { createGame } from '../engine/setup';
import type { Action, AiLevel, GameConfig, GameEvent, GameState, Speed, TerritoryId } from '../engine/types';
import { createGameScreen, showTitle, type GameScreen, type TitleOptions } from '../ui/screens';
import { nextSelection, targetsFor } from '../ui/selection';
import { restore, serialise, type RestoredGame } from './save';
import { loadSoundOn, Sound } from './sound';
import { cuesFor } from './sound-cues';
import { AI_PLACE_MS, AI_ROLL_MS, ELIMINATION_MS, PAUSE_MS, PLACE_MS, ROLL_MS } from './timing';
import type { UrlParams } from './url-params';

const TITLE_KEY = 'hexdice:title';
const SAVE_KEY = 'hexdice:save';
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

function readSave(): RestoredGame | null {
  try {
    return restore(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore: resuming is a convenience.
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
  /** False after the debug load(): its action log is not the whole game. */
  private persist = true;
  private selected: TerritoryId | null = null;
  /** Bumped whenever the running game is abandoned (quit, replay, load); stale async work bails out. */
  private gen = 0;
  private running = -1;
  readonly sound: Sound;

  constructor(
    private readonly root: HTMLElement,
    private readonly params: UrlParams,
  ) {
    this.speed = params.speed ?? 'normal';
    this.sound = new Sound(params.sound ?? loadSoundOn());
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  start(): void {
    if (this.params.seed !== null || this.params.players !== null) {
      const stored = loadTitle();
      const opts = { players: this.params.players ?? stored.players, aiLevel: this.params.aiLevel ?? stored.aiLevel };
      this.newGame(opts, this.params.seed ?? randomSeed());
      this.begin();
    } else {
      this.toTitle(readSave());
    }
  }

  private save(): void {
    if (!this.persist || this.mode !== 'play' || !this.config) return;
    try {
      localStorage.setItem(SAVE_KEY, serialise(this.config, this.actionLog));
    } catch {
      // Ignore: resuming is a convenience.
    }
  }

  private resume(saved: RestoredGame): void {
    this.newGame({ players: 0, aiLevel: 'normal' }, saved.config.seed, saved.config);
    this.state = saved.state;
    this.actionLog = [...saved.actions];
    this.begin();
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
    this.sound.stopAll();
    this.skipping = false;
    this.config = state.config;
    this.state = state;
    this.actionLog = [];
    this.eventLog = [];
    this.replayable = false;
    this.persist = false;
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
    this.turnCue();
    this.renderAll();
    this.kick();
  }
  async idle(): Promise<void> {
    while (!this.state || this.busy || this.mode !== 'play' || !(this.state.winner !== null || this.paused || this.isHumanTurn())) {
      await sleep(10);
    }
  }

  // ---- screen flow ----
  private toTitle(saved: RestoredGame | null = null): void {
    if (!saved) clearSave();
    this.gen++;
    this.sound.stopAll();
    this.skipping = false;
    this.busy = false;
    this.screen = null;
    this.state = null;
    showTitle(
      this.root,
      loadTitle(),
      (opts) => {
        saveTitle(opts);
        this.newGame(opts, randomSeed());
        this.preview(opts);
      },
      { on: this.sound.isOn(), toggle: () => this.toggleSound() },
      saved ? () => this.resume(saved) : undefined,
    );
  }

  private newGame(opts: TitleOptions, seed: number, config?: GameConfig): void {
    clearSave();
    this.persist = true;
    this.gen++;
    this.skipping = false;
    this.config = config ?? makeConfig(defaultSeats(opts.players - 1, opts.aiLevel), seed);
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
      screen.preview.show(
        this.config!.seed,
        {
          onYes: () => {
            screen.preview.hide();
            this.begin();
          },
          onNo: () => {
            this.newGame(opts, randomSeed());
            this.preview(opts);
          },
        },
        this.humanSeat(),
      );
    };
    show();
  }

  private humanSeat(): { name: string; identity: number } | undefined {
    const p = this.state?.players.find((x) => x.kind === 'human');
    return p && this.humans() === 1 ? { name: p.name, identity: p.identity } : undefined;
  }

  private turnCue(): void {
    const s = this.state!;
    if (s.winner !== null || this.autoplay || this.watching || this.mode !== 'play') return;
    const p = s.players[s.current]!;
    if (p.kind !== 'human' || !p.alive) return;
    this.screen!.roll.message(this.humans() === 1 ? 'Your turn: tap one of your territories with 2+ dice' : `${p.name}'s turn`);
  }

  private begin(): void {
    this.save();
    this.turnCue();
    this.renderAll();
    this.kick();
  }

  private setupScreen(): GameScreen {
    const screen = createGameScreen(this.root);
    screen.board.onTap((t) => this.onTap(t));
    screen.hud.onEndTurn(() => {
      if (this.canAct()) void this.submit({ type: 'endTurn' });
      else if (this.canSkip()) this.skip();
    });
    screen.hud.onSpeedChange((s) => {
      this.speed = s;
    });
    screen.hud.onQuit(() => this.toTitle());
    screen.hud.onSoundToggle(() => {
      this.toggleSound();
      this.renderAll();
    });
    return screen;
  }

  private toggleSound(): boolean {
    this.sound.setOn(!this.sound.isOn());
    return this.sound.isOn();
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

  /** AIs are playing a live game you could fast-forward. */
  private canSkip(): boolean {
    const s = this.state;
    return !!s && this.mode === 'play' && !this.paused && !this.skipping && s.winner === null && !this.isHumanTurn();
  }

  private skip(): void {
    this.skipping = true;
    this.renderAll();
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
      skip: this.canSkip() ? (s.players.some((p) => p.kind === 'human' && p.alive) && !this.autoplay ? 'turn' : 'end') : null,
      speed: this.speed,
      mode: this.mode,
      sound: this.sound.isOn(),
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
      else if (this.canSkip()) this.skip();
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
      this.save();
      this.eventLog.push(...events);
    }
    const byAi = this.autoplay || before.players[before.current]!.kind === 'ai';
    const humans = this.autoplay ? [] : before.players.filter((p) => p.kind === 'human' && p.alive).map((p) => p.id);
    const cues = cuesFor(events, { speed, byAi, mode: this.mode, humans });
    const roll = events.find((e) => e.type === 'attackRolled');
    if (roll) {
      this.renderBoard(false, { from: roll.from, to: roll.to }, before);
      if (cues.dice) this.sound.dice(cues.dice);
      await this.screen!.roll.show(roll, before, (byAi ? AI_ROLL_MS : ROLL_MS)[speed]);
      if (gen !== this.gen) return;
      if (cues.result) this.sound.result(cues.result);
    }
    this.state = next;
    this.renderAll();
    if (roll && !roll.success) {
      // Not awaited: the label fades on its own and shouldn't slow the game down.
      const lost = before.territories[roll.from]!.dice - next.territories[roll.from]!.dice;
      void this.screen!.board.showLoss(roll.from, lost, (byAi ? AI_PLACE_MS : PLACE_MS)[speed] * 1.5);
    }
    const out = events.find((e) => e.type === 'playerEliminated');
    if (out && roll) {
      // The big bang: the game deliberately holds here so a knockout lands.
      const loser = next.players[out.player]!;
      const winner = next.players[out.by]!;
      const solo = this.humans() === 1;
      const title = solo && loser.kind === 'human' ? 'You were eliminated' : `${loser.name} eliminated`;
      const bonus = winner.knockouts * next.config.eliminationBonus;
      const by = solo && winner.kind === 'human' ? 'you' : winner.name;
      const detail = `by ${by}${bonus > 0 ? ` · ${by === 'you' ? 'you now get' : 'now gets'} +${bonus} ${bonus === 1 ? 'die' : 'dice'} per turn` : ''}`;
      const ms = ELIMINATION_MS[speed];
      const at = this.screen!.board.verticalPosition(roll.to) < 0.5 ? 0.72 : 0.28;
      if (cues.knockout) this.sound.knockout(cues.knockout);
      await Promise.all([this.screen!.board.showBurst(roll.to, loser.identity, ms), this.screen!.banner.show(title, detail, loser.identity, ms, at)]);
      if (gen !== this.gen) return;
    }
    const reinforced = events.find((e) => e.type === 'reinforced');
    if (reinforced) {
      const name = next.players[reinforced.player]?.name ?? '';
      const parts = [`${name} +${reinforced.placed.length}`, `largest group ${reinforced.largestGroup}`];
      if (reinforced.bonus > 0) parts.push(`+${reinforced.bonus} knockout bonus`);
      if (reinforced.reserve > 0) parts.push(`${reinforced.reserve} in reserve`);
      this.screen!.roll.message(parts.join(' · '));
      if (cues.place) this.sound.place(cues.place);
      await this.screen!.board.showPlacements(reinforced.placed, (byAi ? AI_PLACE_MS : PLACE_MS)[speed]);
      if (gen !== this.gen) return;
    }
    if (events.some((e) => e.type === 'turnStarted')) this.turnCue();
    if (cues.yourTurn) this.sound.yourTurn();
    if (cues.sting) this.sound.sting(cues.sting);
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
  /** Set by the skip button: AI turns play instantly until a human's turn or the end. */
  private skipping = false;

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
          this.skipping = false;
          this.renderAll();
          return;
        }
        this.busy = true;
        this.renderAll();
        const pace: Speed = this.skipping ? 'instant' : this.speed;
        await sleep(PAUSE_MS[pace]);
        if (gen !== this.gen) return;
        const level: AiLevel = s.players[s.current]!.aiLevel ?? 'normal';
        await this.play(chooseAction(s, level, this.aiRng), gen, pace, true);
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
    clearSave();
    this.busy = false;
    this.skipping = false;
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
    this.sound.stopAll();
    this.skipping = false;
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
