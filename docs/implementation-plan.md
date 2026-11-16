# Hexdice v0.1 Implementation Plan

> **For agentic workers:** you implement exactly one task below, in your own git worktree. Read `CLAUDE.md`, `docs/plan.md` (the spec; §3 is the authoritative rule set) and your task. Steps use checkbox (`- [ ]`) syntax. TDD: write the failing tests first.

**Goal:** a playable, locally running dice-conquest game (you vs 1–7 AI) with a four-gate playtest loop.

**Architecture:** pure, seeded TypeScript engine (`src/engine`) and AI (`src/ai`); an SVG/DOM UI (`src/ui`) that renders state and plays events; a controller (`src/game`) that runs one action at a time. Everything random goes through `Rng`, whose state lives in `GameState`.

**Tech stack:** Vite 8, TypeScript 6 (strict, `verbatimModuleSyntax`), Vitest 5, Playwright 1.65, tsx. No runtime dependencies.

**Spec:** `docs/plan.md`

## Global Constraints

- The contract is read-only for task agents: `src/engine/types.ts`, `rng.ts`, `hex.ts`, `config.ts`, `seats.ts`, `tests/fixtures/*`. If you need a change there, stop and report what and why.
- Touch only the files your task lists. No new dependencies of any kind.
- Engine, AI and sim: no DOM, `window`, timers or `Math.random()`. All randomness via `Rng`.
- `applyAction` never mutates its input. `config` and `board` never change after `createGame` and may be shared by reference.
- Rule defaults (from `DEFAULT_RULES`): 32 × 24 grid, 30 territories, 6–40 cells each, land ratio 0.65–0.75, max 8 dice per territory, reserve cap 64, starting dice per player `floor(3 × territories ÷ players)`.
- Hex grid: pointy-top, odd-r offset, cell = `row * width + col`, directions 0..5 = E, SE, SW, W, NW, NE (see `hex.ts`).
- Input: pointer events only (`pointerup`/`click`), nothing hover-only, the whole territory is the tap target.
- Test hooks: `data-territory="<id>"` on each territory group, `data-testid` values exactly as named in the tasks.
- Our own look: flat, clean SVG. No isometric dice, no imitation of any existing game's logo, art or typography.
- UI copy in British English. Dates in docs DD-MM-YYYY.
- E2E: run with the `E2E_PORT` your brief gives you (never the default), so parallel worktrees don't share a dev server.
- Git: commit on your worktree branch only. Never push, force-push, amend or rebase. Never bypass signing (no `--no-gpg-sign`, no `-c commit.gpgsign=false`); if signing fails, stop and report it.
- Finish with a short report: what you built, test results (command + summary), anything you could not verify and why, and any contract change you need.

## Review Focus

1. Taps while the game is busy (dice tumbling, AI turn, double tap) are ignored and never queue a second attack or end-turn. → Task E `ignores taps while busy`.
2. Taps that aren't a legal attack (own 1-die territory, non-neighbour, sea, the selected territory again) change selection predictably and never attack. → Task C `nextSelection` tests.
3. You're eliminated while the game goes on: overlay with Watch the rest and Title; watching runs the AIs to game over with no input. → Task E `eliminated player can watch the rest`.
4. Phone portrait (Pixel 7): roll strip, whole board, player bar and End turn visible, no horizontal scroll. → Task C harness test and Task E `phone layout fits`.
5. Every border territory full at 8 dice: the AI must still attack eventually, so games end. → Task D `normal attacks when every border is full` and the sim's round cap.

---

### Task A: Map generation and game setup

**Files:**
- Create: `src/engine/mapgen.ts`, `src/engine/setup.ts`
- Test: `tests/unit/mapgen.test.ts`, `tests/unit/setup.test.ts`

**Interfaces:**
- Consumes: `Rng`; `neighbours`, `hexDistance`, `cellIndex` from `hex.ts`; `DEFAULT_RULES`, `makeConfig`, `MIN_PLAYERS`, `MAX_PLAYERS`; `defaultSeats`, `aiSeats`; types.
- Produces:
  - `type MapTerritory = Pick<Territory, 'id' | 'cells' | 'neighbours' | 'centre'>`
  - `generateMap(rules: RulesConfig, rng: Rng): { board: Board; territories: MapTerritory[] }`
  - `createGame(config: GameConfig): GameState`

- [ ] **Step 1: Write failing `tests/unit/mapgen.test.ts`.** For seeds 1..1000 with `DEFAULT_RULES`:
  - `generates exactly territoryCount territories`: length 30, `territories[i].id === i`.
  - `territories are contiguous and within size bounds`: 6 ≤ cells ≤ 40; flood fill inside a territory's cells reaches all of them; `cells` ascending.
  - `land ratio is within bounds`: land cells ÷ 768 in [0.65, 0.75].
  - `board and territories agree`: every land cell appears in exactly one territory's `cells` and `board.cellTerritory[cell]` names that territory; sea is -1.
  - `adjacency matches shared edges`: recompute neighbours from `board.cellTerritory` + `neighbours()`; equal to `territories[i].neighbours` (ascending, symmetric).
  - `territory graph is connected`.
  - `centre is an interior cell when one exists`: `centre` ∈ `cells`; if any cell of the territory has all 6 neighbours inside it, `centre` is such a cell.
  - `is deterministic`: same seed → `toEqual`; seeds 1 and 2 differ.
  - `is fast enough`: 200 generations take < 10 s in total.
- [ ] **Step 2:** `npx vitest run tests/unit/mapgen.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `generateMap`.** Algorithm is your call (e.g. grow a land blob, place 30 seeds spread apart, grow territories round-robin into free land, repair undersized ones). If a draw fails validation, retry with the same `rng` (keeps determinism). Prefer the most interior cell for `centre` (max distance to the territory border, ties → lowest index).
- [ ] **Step 4:** mapgen tests PASS.
- [ ] **Step 5: Write failing `tests/unit/setup.test.ts`:**
  - `rejects fewer than 2 or more than 8 seats` (throws `RangeError`).
  - `players are the seats in a seeded random order`: same names/kinds/levels/identities as the seats; `id === index`; `reserve 0`; `alive true`; two seeds give different orders for 8 seats.
  - `deals every territory, evenly`: per-player counts differ by at most 1.
  - `starting dice are equal per player`: each player's total = `floor(3 × 30 ÷ players)` (8 → 11, 4 → 22, 2 → 45); every territory 1..8.
  - `initial state`: `current 0`, `round 1`, `winner null`; `createGame(config)` twice is `toEqual`.
- [ ] **Step 6: Implement `createGame`:** `Rng(config.seed)` → shuffle seats into players → `generateMap` → shuffle territory ids and deal round-robin → 1 die each, then each player's remaining dice one at a time on random own territories below `maxDice` → store `rng.state` in `rngState`.
- [ ] **Step 7:** `npm run check` PASS. Commit: `feat(engine): map generation and game setup`.

### Task B: Rules and odds

**Files:**
- Create: `src/engine/rules.ts`, `src/engine/odds.ts`
- Test: `tests/unit/rules.test.ts`, `tests/unit/odds.test.ts`

**Interfaces:**
- Consumes: types, `IllegalActionError`, `Rng`; `buildState` from `tests/fixtures/state.ts`.
- Produces:
  - `isLegalAttack(state: GameState, from: TerritoryId, to: TerritoryId): boolean`: for `state.current`; false after game over.
  - `legalAttacks(state: GameState): Array<{ from: TerritoryId; to: TerritoryId }>`: sorted by `from`, then `to`.
  - `largestGroup(state: GameState, player: PlayerId): number`
  - `applyAction(state: GameState, action: Action): ActionResult`: throws `IllegalActionError` on an illegal attack or any action after game over.
  - `sumDistribution(dice: number): number[]`: index = sum, value = number of ways (length `6 × dice + 1`).
  - `winProbability(attackDice: number, defendDice: number): number`: P(attack sum > defend sum), table precomputed for 1..8.

- [ ] **Step 1: Write failing `tests/unit/odds.test.ts`:** `1 vs 1 is 15/36`; `matches brute force up to 3 vs 3`; `ties favour the defender` (n vs n < 0.5 for 1..8); `more attack dice never lower the odds`; `sumDistribution(2) sums to 36`.
- [ ] **Step 2:** FAIL, then implement `odds.ts` (convolution), then PASS.
- [ ] **Step 3: Write failing `tests/unit/rules.test.ts`** (all states via `buildState`):
  - Legality: `cannot attack from a 1-die territory`, `cannot attack own territory`, `cannot attack a non-neighbour`, `cannot attack from another player's territory`, `no actions after game over` (throws).
  - `legalAttacks lists exactly the legal pairs` on a 5-territory fixture.
  - `applyAction does not mutate its input`: `structuredClone` before, `toEqual` after.
  - Attack outcomes, 8 vs 1 and 3 vs 3 over seeds 1..300: rolls have the right lengths and values 1..6; sums equal the roll totals; `success === attackSum > defendSum`. On success: target owner = attacker, target dice = source dice − 1, source = 1, plus `territoryCaptured`. On failure: source = 1, target unchanged.
  - `ties go to the defender`: no tied event has `success: true`.
  - `capturing the last territory eliminates the player`: `playerEliminated`, `alive false`, `reserve 0`.
  - `last player standing wins`: `gameOver` event, `winner` set.
  - Reinforcement on `endTurn`: `uses the largest connected group` (own groups of 3 and 2 → 3 dice placed); `adds the reserve`; `overflow goes to the reserve, capped at 64` (all own at 8 → reserve = min(64, reserve + amount)); `never exceeds 8 dice`; `reinforced` event lists one territory per placed die.
  - Turn order: `passes to the next alive player`, `skips eliminated players`, `round increments on wrap`, `emits turnStarted`.
  - `same state and action give the same result`.
- [ ] **Step 4:** FAIL, then implement `rules.ts`. Clone with `structuredClone` on territories and players only; keep `config` and `board` by reference. Keep attack resolution, reinforcement and turn advance as separate internal functions (future powers will hook in there). RNG order: attacker's dice, then defender's, then one draw per placed die.
- [ ] **Step 5:** `npm run check` PASS. Commit: `feat(engine): rules and odds`.

### Task C: Board UI

**Files:**
- Create: `src/ui/identity.ts`, `src/ui/selection.ts`, `src/ui/board-view.ts`, `src/ui/roll-view.ts`, `src/ui/hud.ts`, `src/ui/screens.ts`, `src/ui/ui.css`, `src/ui/harness.ts`, `harness.html`
- Modify: `src/style.css`
- Test: `tests/unit/selection.test.ts`, `tests/e2e/ui-harness.spec.ts`

**Interfaces:**
- Consumes: types, `hex.ts` geometry, `fixtureBoardState` from `tests/fixtures/state.ts`. Not `rules.ts` (built in parallel).
- Produces (Task E uses these exact names):
  - `identity.ts`: `PALETTE: readonly string[]` (8 fills), `playerColour(identity: number): string`, `emblemPath(identity: number, size: number): string` (SVG path, centred on 0,0), `EMBLEM_NAMES: readonly string[]`.
  - `selection.ts`: `interface SelectionResult { selected: TerritoryId | null; attack: { from: TerritoryId; to: TerritoryId } | null }`; `nextSelection(state: GameState, selected: TerritoryId | null, tapped: TerritoryId | null, canAttack: (from: TerritoryId, to: TerritoryId) => boolean): SelectionResult`; `targetsFor(state: GameState, from: TerritoryId, canAttack: (from: TerritoryId, to: TerritoryId) => boolean): TerritoryId[]`.
  - `board-view.ts`: `interface BoardViewState { selected: TerritoryId | null; targets: TerritoryId[]; attack: { from: TerritoryId; to: TerritoryId } | null; interactive: boolean }`; `class BoardView { constructor(container: HTMLElement); render(state: GameState, view: BoardViewState): void; onTap(handler: (territory: TerritoryId | null) => void): void }`. SVG `data-testid="board"`; each territory a `<g data-territory data-owner data-dice>` with classes `is-selected`, `is-target`, `is-attack`; tapping sea or background → `null`.
  - `roll-view.ts`: `class RollView { constructor(container: HTMLElement); show(event: AttackRolledEvent, state: GameState, durationMs: number): Promise<void>; clear(): void }`. Test ids `roll`, `roll-defender`, `roll-attacker`, `roll-defender-sum`, `roll-attacker-sum`; the winning side gets class `is-winner`.
  - `hud.ts`: `interface HudOptions { largestGroups: number[]; canEndTurn: boolean; speed: Speed; mode: 'play' | 'replay' }`; `class Hud { constructor(container: HTMLElement); render(state: GameState, opts: HudOptions): void; onEndTurn(h: () => void): void; onSpeedChange(h: (speed: Speed) => void): void; onQuit(h: () => void): void }`. Test ids `player-<id>` (current one has `aria-current="true"`), `round`, `end-turn`, `speed` (a `<select>`), `quit`.
  - `screens.ts`:
    - `interface TitleOptions { players: number; aiLevel: AiLevel }`; `showTitle(root: HTMLElement, initial: TitleOptions, onStart: (opts: TitleOptions) => void): void`. Test ids `title`, `players-2` … `players-8` (chosen one `aria-pressed="true"`), `ai-easy`, `ai-normal`, `start`.
    - `interface GameScreen { board: BoardView; roll: RollView; hud: Hud; preview: PreviewPrompt; overlay: GameOverOverlay }`; `createGameScreen(root: HTMLElement): GameScreen`: layout top to bottom = roll strip, board, player bar + controls.
    - `class PreviewPrompt { show(seed: number, handlers: { onYes: () => void; onNo: () => void }): void; hide(): void }`. Test ids `preview`, `preview-yes`, `preview-no`, `preview-seed`. Shown in place of the player bar.
    - `class GameOverOverlay { show(title: string, actions: { onTitle: () => void; onReplay: (() => void) | null; onWatch: (() => void) | null }): void; hide(): void }`. A band across the board. Test ids `overlay`, `overlay-heading`, `overlay-title`, `overlay-replay`, `overlay-watch` (buttons only rendered when their handler isn't null).

- [ ] **Step 1: Write failing `tests/unit/selection.test.ts`** (fixture via `buildState`, `canAttack` = owner differs + neighbour + source dice ≥ 2): `tapping own territory with 2+ dice selects it`; `tapping own 1-die territory clears selection`; `tapping the selected territory deselects`; `tapping another own 2+ territory switches`; `tapping a legal target returns the attack and clears selection`; `tapping an illegal enemy clears selection`; `tapping sea clears selection`; `targetsFor lists exactly the legal targets`. "Own" means `state.current`'s.
- [ ] **Step 2:** FAIL, implement `selection.ts`, PASS.
- [ ] **Step 3: Visual direction.** Load the `frontend-design:frontend-design` skill. Spec: docs/plan.md §5 "UI v0.1". Flat territories with a crisp outline per territory (outline = cell edges whose neighbour is another territory or sea), dice token at `centre` showing the count plus the owner's emblem, 8 colours differing in lightness as well as hue. Selected/target/attack states must be obvious without colour alone (outline weight or pattern). Roll strip: defender left, attacker always right, dice faces with pips in the player's colour, sum per side, a short tumble then settle (`durationMs` 0 → instant).
- [ ] **Step 4: Implement** `identity.ts`, `board-view.ts`, `roll-view.ts`, `hud.ts`, `screens.ts`, `ui.css`, `src/style.css`. The SVG scales to its container (`viewBox`); at phone width the layout stacks with no horizontal scroll.
- [ ] **Step 5: Harness.** `harness.html` + `src/ui/harness.ts`: renders `createGameScreen` with `fixtureBoardState(seed, players)` from `?seed=&players=`; taps drive `nextSelection`; `?roll=1` shows a sample roll (attacker 4 dice vs defender 3); `?overlay=1` shows the game-over overlay; `?preview=1` shows the preview prompt; `?title=1` shows the title screen instead.
- [ ] **Step 6: Write `tests/e2e/ui-harness.spec.ts`** (runs in both projects): `renders 30 territories`; `tapping an own 2+ territory selects it`; `attacker is on the right` (`roll-attacker` box x > `roll-defender` box x); `no horizontal scroll` (`scrollWidth <= innerWidth`); `title screen has 2–8 player chips`; saves screenshots `playtest/screens/ui-<project>-{board,roll,overlay,title,preview}.png`.
- [ ] **Step 7:** `npm run check` and `E2E_PORT=<your port> npx playwright test tests/e2e/ui-harness.spec.ts` PASS. Commit: `feat(ui): board, roll strip, HUD and screens`.

### Task D: AI and simulator

**Files:**
- Modify: `src/ai/index.ts` (replace the stub body; keep the signature)
- Create: `src/ai/easy.ts`, `src/ai/normal.ts`, `scripts/sim.ts`
- Test: `tests/unit/ai.test.ts`; output `playtest/sim-latest.json`

**Interfaces:**
- Consumes: `legalAttacks`, `isLegalAttack`, `applyAction`, `largestGroup` (rules); `winProbability` (odds); `createGame` (setup); `aiSeats`, `makeConfig`, `Rng`.
- Produces: `chooseAction(state: GameState, level: AiLevel, rng: Rng): Action` for `state.current`; pure apart from drawing from `rng`.

- [ ] **Step 1: Write failing `tests/unit/ai.test.ts`:** `ends the turn when there is no legal attack`; `only returns legal actions` (200 random `createGame` states × both levels); `normal takes an overwhelming attack` (8 vs 1); `normal declines a hopeless attack` (2 vs 8, nothing else legal → `endTurn`); `normal attacks when every border is full` (all territories at 8 → returns an attack); `easy attacks sometimes` (across 100 rng seeds on a board with legal attacks, at least one attack); `is deterministic for the same rng seed`.
- [ ] **Step 2:** FAIL, implement Easy (mostly random legal attacks, never certain-loss ones) and Normal (odds-driven via `winProbability`; prefers attacks that join its own groups or split the leader's largest group; mindful of leaving big stacks exposed; must not stall on a full board). PASS.
- [ ] **Step 3: Implement `scripts/sim.ts`:** `npm run sim -- --games 500 [--seed 1] [--out playtest/sim-latest.json]`. Half the games are 1v1 Normal vs Easy; half are 8-player all-Normal. Each game: `createGame` → loop `chooseAction` → assert `isLegalAttack` for attacks → `applyAction` until `winner` or round > 1000. Output JSON `{ date, games, normalVsEasy: { games, normalWins, winRate }, eightPlayer: { games, avgRounds, maxRounds, winsBySeat }, crashes, illegalActions, roundCapHits, durationMs }` and a console summary. Exit code 1 on any crash, illegal action or cap hit, or Normal's win rate < 0.70.
- [ ] **Step 4:** `npm run sim -- --games 500` PASS in under 3 minutes. If Normal is short of 70%, tune the AI; don't change the threshold.
- [ ] **Step 5:** `npm run check` PASS. Commit `feat(ai): easy and normal AI, simulator` including `playtest/sim-latest.json`.

### Task E: Integration

**Files:**
- Create: `src/game/controller.ts`, `src/game/url-params.ts`, `src/game/timing.ts`, `src/debug.ts`, `tests/unit/url-params.test.ts`, `tests/e2e/game.spec.ts`
- Modify: `src/main.ts`
- Delete: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: Tasks A–D and the stub/real `chooseAction`.
- Produces:
  - `parseUrlParams(search: string): { seed: number | null; players: number | null; aiLevel: AiLevel | null; speed: Speed | null }`: invalid → null, players clamped to 2..8.
  - Dev-only `window.__hexdice: { state(): GameState | null; actions(): Action[]; events(): GameEvent[]; attack(from: TerritoryId, to: TerritoryId): Promise<void>; endTurn(): Promise<void>; autoplay(on: boolean): void; load(state: GameState): void; idle(): Promise<void> }` (`idle` resolves when nothing is animating and it's a human's turn or the game is over).

- [ ] **Step 1: Write failing `tests/unit/url-params.test.ts`:** parses `?seed=42&players=4&ai=easy&speed=instant`; `players=99` → 8; `players=1` → 2; `seed=abc` → null; unknown `ai`/`speed` → null; empty string → all null.
- [ ] **Step 2:** FAIL, implement, PASS.
- [ ] **Step 3: Implement the controller and `main.ts`.** Flow: title (last choice remembered in `localStorage` key `hexdice:title`, wrapped in try/catch) → preview (`createGame` with `randomSeed()`; No → new seed) → game → overlay. URL `seed` or `players` skip title and preview. Turn flow per docs/plan.md §5: one action at a time; events animate in order; input locked while busy or during AI turns; human input only when the current seat is human (any number of human seats must work); Space ends the turn, Esc deselects, the HUD's quit button returns to the title. AI decisions use `new Rng(config.seed ^ 0x9e3779b9)`. Timing defaults in `timing.ts`: roll 1600/900/400/0 ms and pause between AI actions 500/250/80/0 ms for slow/normal/fast/instant. You eliminated → overlay "You were eliminated" with Watch the rest + Title (AI paused until you choose). Game over → "You win" / "<name> wins" with Title + Replay. Replay re-runs `createGame(config)` + the action log at fast speed, input locked, HUD `mode: 'replay'`, then the overlay again.
- [ ] **Step 4: Debug hook** in `src/debug.ts`, installed only when `import.meta.env.DEV`. `attack` and `endTurn` go through the same path as taps.
- [ ] **Step 5: Write `tests/e2e/game.spec.ts`** (both projects): `title → preview → game` (choose 4 players, Start, No changes the seed, Yes shows the board with 30 territories); `attacks by tapping` (`?seed=42&players=4&speed=instant`, find a legal attack for the human via `__hexdice.state()`, tap source then target, roll strip shows both sums, source has 1 die); `ignores taps while busy` (`speed=slow`, tap target five times fast → exactly one `attackRolled` in `events()`); `ends turn and the AIs play` (round becomes 2, it's your turn again); `autoplay reaches game over and replay runs` (`players=4&speed=instant`, `autoplay(true)`, overlay within 60 s, Replay plays to the overlay again); `eliminated player can watch the rest` (`load()` a state where you hold one 1-die territory next to an 8-die AI and it's that AI's turn; overlay shows Watch the rest; click it; game over overlay follows); `phone layout fits` (phone project: no horizontal scroll; `roll`, `board`, `end-turn` within the viewport). Screenshots to `playtest/screens/game-<project>-*.png`.
- [ ] **Step 6:** `npm run check` and `E2E_PORT=<your port> npm run e2e` PASS. Commit: `feat(game): controller, screen flow, replay and debug hook`.
