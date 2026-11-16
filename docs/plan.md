# Hexdice: design

Approved 16-11-2026 · Working title "Hexdice" (rename freely)

## 1. What we're building, and why

A browser game in the dice-conquest genre that Dice Wars made famous: a hex map split into territories, each holding a stack of dice; you attack neighbours by rolling, and at the end of your turn you're reinforced by the size of your largest connected region. It runs locally (`npm run dev`), single device, you against AI players. Your later ideas include hot-seat, touch-first mobile play and making it easy to see who is who, so the base is built ready for all three.

The point of v0.1 is a **solid, playable base to build your improvement ideas on**, not a finished product. So the priorities are: rules you can trust, an engine that's easy to change, and a playtest loop that proves every change works before you see it.

**Originality.** This is our own game in that genre: the classic mechanics, with its own name, visuals and identity. We don't copy Dice Wars' name, art, layout or look (no isometric dice stacks, no lookalike palette or UI).

## 2. Goals, non-goals, anti-goals

**Goals (v0.1)**
- Complete game loop: title → board preview → play → game over → replay or back to title.
- 2–8 players: you + 1–7 AI, default you + 7 AI. Two AI levels (Easy, Normal).
- Clear player identity: every player has a colour, an emblem and a name; your seat is always marked "You".
- Playable by touch at phone size (basic but usable); desktop mouse and keyboard too.
- Seeded and deterministic: same seed + same moves = same game. Every bug is reproducible.
- Four-layer playtest gate (section 6) that runs on every change.

**Non-goals (v0.1, parked for your ideas)**
- Hot-seat UI. Engine, player model and controller handle several human seats from day one; only the setup option and a "pass the device" screen are parked.
- Mobile polish beyond basic touch play (gestures, zoom, install as an app).
- Online multiplayer, accounts, persistence/save games.
- Sound, map editor, undo, alternative rule sets.
- A "Hard" AI (stretch only if time allows).

**Anti-goals (would be a failure even if it runs)**
- A Dice Wars clone in name or look.
- Engine logic tangled into rendering, so rule changes mean UI surgery.
- "It compiles" deliveries: anything merged without passing the playtest gate.
- Flaky automated playtests (clicking pixel coordinates, timing sleeps).

## 3. Rules (the spec agents build against)

This section is the complete, authoritative rule set. It's our design, not a paraphrase of Dice Wars. All numbers are **config defaults**, not constants, so they can be tuned later.

**Board**
- Hex grid, default 32 × 24 cells. Territories are contiguous blobs of cells; the rest is sea. *(My call:)* roughly 65–75% land, one compact continent with a ragged coast; small inland lakes allowed.
- Default 30 territories. Every territory has ≥ 6 cells. The territory adjacency graph is connected (one landmass).
- **Lakes** (added 16-11-2026, from Jacob): 3 inland lakes of 4–9 cells (they may merge), never touching the open sea. Territories can't border across water, so lakes create chokepoints and defensible spots.
- Two territories are adjacent if any of their cells share an edge.

**Setup**
- Players: 2–8, default 8 (you + 7 AI). Seat order is random, then fixed *(my call: fair on average)*.
- Territories are dealt at random, as evenly as possible.
- Every player starts with the same total dice, T = floor(3 × territories ÷ players) (30 territories, 8 players → 11). Each territory gets 1 die; the player's remaining dice are placed on random own territories, max 8 per territory.

**A turn**
- The active player makes any number of attacks, then ends the turn.
- **Attack:** from an own territory with ≥ 2 dice into an adjacent enemy territory. Attacker rolls all dice in the source, defender all dice in the target (d6 each). Attacker wins only on a strictly higher sum; ties go to the defender. What a failed attack (loss or draw) costs the attacking stack is the `lossRule` setting (added 16-11-2026, from Jacob): `classic` (drops to 1) or `attrition` (drops to the defender's dice, losing at least 1, never below 1). Note that attrition lets one big stack retry the same target within a turn at shrinking cost. Draws are 3.6% of attacks.
  - Win: target changes owner; source dice − 1 move into it; source keeps 1. (A source holds at most 8, so the target never gets more than 7.)
  - Loss: source drops to 1; target unchanged.
- A player who loses their last territory is eliminated; their reserve is discarded.
- **Reinforcement (end of turn):** amount = number of territories in the player's largest connected group of own territories, plus their reserve, plus the **knockout bonus**: +1 die per turn, permanently, for each opponent the player has eliminated (`eliminationBonus`, added 16-11-2026, from Jacob). Dice are placed one at a time on random own territories with < 8 dice. Leftovers go to the reserve, capped at 64.
- **Game over:** one player owns every territory. If you're eliminated: defeat screen with "watch the rest" or "new game".

**Odds:** the engine precomputes the exact win probability for every a-vs-d dice matchup (1–8 each). AI uses it; the UI can show it later.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (recommended)** | **Vite + TypeScript, SVG board, plain DOM UI** | Same base as voxel-kart (Vite + TS, DOM menus, no framework). SVG gives one element per territory: crisp at any size, CSS hover/selection, and tests and agents click `[data-territory="12"]` instead of pixel coordinates. Easily fast enough for ~30 territories / ~800 cells. Fancy particle effects would be harder. |
| B | Canvas 2D or PixiJS | Better for heavy animation, but hit-testing is manual and automated playtests must click coordinates: brittle, which works against the playtest goal. Overkill for a turn-based board. |
| C | Lit components + SVG board | You know Lit well and it would tidy up menus, but the game has three screens and a HUD. A framework adds weight without paying for itself yet. Easy to adopt later for the UI chrome if menus grow. |

Phaser and similar engines were dropped: canvas-based (same testing problem as B) and far more than a turn-based board needs.

## 5. Architecture

```
src/engine/   pure TS, no DOM. rng, hex math, mapgen, rules, odds, types
src/ai/       pure TS. chooseAction(state, playerId, rng) → Action
src/ui/       SVG board view, HUD, screens (setup / game / game over), input, animation
src/main.ts   controller: owns the game state, feeds actions in, plays events out
src/debug.ts  dev-only window.__hexdice test hook
scripts/sim.ts   headless AI-vs-AI simulator
tests/unit/   Vitest      tests/e2e/   Playwright
```

- **Players are seats:** `{ id, name, colour, emblem, kind: 'human' | 'ai', aiLevel? }`. The controller loops over seats without assuming a single human, so hot-seat later is a UI addition, not a rewrite.
- **Touch-ready input:** pointer events only (mouse, touch and pen alike), tap to select and tap to attack, nothing that only works on hover, generous tap targets. The SVG scales to its container; the layout stacks board above HUD at phone width.
- **One engine API:** `createGame(config, seed)`, `legalAttacks(state)`, `applyAction(state, action) → { state, events }`. Pure functions; human and AI submit the same `Action` (`attack` / `endTurn`).
- **Events drive the UI:** `attackRolled`, `territoryCaptured`, `playerEliminated`, `reinforced`, `turnStarted`, `gameOver`. The UI renders state and animates events; it never computes rules.
- **Turn flow** *(my call)*: the controller applies one action at a time. Its events animate in order, and the next action (AI move or human click) is only taken once they've finished. Input is locked during AI turns. Speed setting: slow / normal / fast / instant (instant = zero-length animations, used by tests). After you're eliminated, the AI loop keeps running at the chosen speed until game over. "New game" is always available.
- **Randomness:** seeded PRNG (mulberry32-style, no dependency) whose state lives inside `GameState`. State is plain JSON, so replays and repro files come free.
- **URL params:** `?seed=42&players=6&ai=normal&speed=instant` start a game directly (used by tests and repro links).
- **Debug hook** (dev builds only): `__hexdice.state()`, `.attack(from, to)`, `.endTurn()`, `.autoplay(true)`.
- **Dependencies:** vite, typescript, vitest, @playwright/test, tsx. Nothing at runtime.

**UI v0.1** (screen flow from your reference screenshots, 16-11-2026; our own visual style throughout, no copied logo, dice art or typography):
- **Title screen:** game name, player-count chips "2 players" … "8 players" (total including you; default 8, last choice remembered), AI level, Start.
- **Board preview:** the generated board with owners and starting dice, "Play this board?" Yes / No. No generates a new board (new seed). The seed is shown small, for repro.
- **Game screen, top to bottom:**
  - **Roll strip** (on top so it stays in view on phones; your call, to be confirmed in playtests). The defender is on the left and the attacker, the active player, is **always on the right**. Each side shows its dice faces (pips, in the player's colour, with their emblem) and its sum. The dice tumble briefly, then settle; the winning side is emphasised. The attacking territory and its target are highlighted on the board meanwhile.
  - **Board.**
  - **Player bar:** one chip per player in turn order with emblem, colour and largest-group number (plus reserve when > 0). The current player is highlighted, eliminated players greyed out, your chip marked "You". End turn button and speed control sit beside it.
- **Game over overlay** across the board: "You win" / "You were eliminated" / "<name> wins", buttons **Title** and **Replay**. If you're eliminated while the game continues, a third button: **Watch the rest**.
- **Replay:** plays the finished game back from its seed and move log at fast speed, read-only. Cheap because the engine is deterministic.

Click own territory (≥ 2 dice) to select and highlight valid targets; click a target to attack; Esc deselects; Space ends turn. Flat, clean look with our own palette and a numbered dice token per territory. *(My call:)* the 8 player colours differ in lightness as well as hue; each player's emblem (a simple shape) sits on their dice tokens; the player panel and roll result always show colour, emblem and name. A richer "who is who" treatment is one of your later ideas.

## 6. Playtesting: how every change gets proven

| Gate | Command | Passes when |
|---|---|---|
| 1. Unit | `npm run check` (tsc + Vitest) | Engine invariants hold: territory count constant, dice always 1–8 per territory, adjacency symmetric, attack/reinforcement/elimination/victory correct on fixture maps, odds table matches brute force. |
| 2. Simulation | `npm run sim -- --games 500` | 0 crashes, 0 illegal actions, every game ends before a 1,000-turn cap, Normal beats Easy in ≥ 70% of 1v1 games (seat order alternated). If it falls short, the AI gets tuned; the threshold only moves with your OK. Stats (game length, seat win rates) saved to `playtest/sim-latest.json` so balance shifts show up between changes. |
| 3. E2E | `npm run e2e` (Playwright) | Seeded game: a real attack by clicking territories, end turn, AI turn completes, HUD updates; plus a full game on autoplay to a game-over screen. Runs at desktop size and at phone size with touch. Screenshots saved. |
| 4. Hands-on | Me, in the browser pane (you can watch) | I play real turns and write `playtest/DD-MM-YYYY-<change>.md`: screenshots, what felt off, and every scenario marked verified / partly verified / not testable (with why). |

Which gates run: rules or AI change → 1, 2, 4 (short). UI change → 1, 3, 4. Anything → at least 1. Bug reports always carry seed + action log.

## 7. Execution: me as PM, subagents as builders

**Phase 0: Foundation (me, no agents).** New folder `~/Projects/hexdice`, `git init`, Vite + TS scaffold, dev dependencies, npm scripts, folder skeleton, the shared contract (`src/engine/types.ts`: `GameState`, `Territory`, `Action`, `GameEvent`, `Config`), rng and hex helpers, `CLAUDE.md`, this plan as `docs/plan.md`, `.claude/launch.json` for the browser pane. First commit. The contract is what makes parallel work safe.

**Phase 1: Parallel build (3 agents, each in its own git worktree, separate folders)**
- **A · Map:** `mapgen.ts` + tests. Seeded, connected, size bounds, dealing and starting dice. Accept: 1,000 seeds all valid, deterministic, < 50 ms each.
- **B · Rules:** `rules.ts`, `odds.ts` + tests against hand-made fixture maps (doesn't wait for A).
- **C · Board UI:** board view, HUD, screens, pointer input, player identity (colour + emblem + name), built against a fixture `GameState` JSON. Delivers Playwright screenshots of a static board at desktop and phone size.

I review each diff, merge, run gate 1.

**Phase 2: Bring it to life (2 agents in parallel)**
- **D · AI + simulator:** Easy (random legal attacks) and Normal (odds-driven, prefers attacks that join its regions or split the leader's), plus `scripts/sim.ts`. Accept: gate 2.
- **E · Integration:** controller, screen flow (title → preview → game → game over), turn flow, event animations, speed setting, replay, URL params, debug hook, e2e tests. Uses a stub AI ("always end turn") until D merges. Accept: gate 3.

**Phase 3: Playtest and polish (me + up to 2 fix agents).** All four gates, hands-on playtest, triage into a short bug list, fix agents for the worst ones, re-gate. Hand-over: how to run it, the playtest report, known issues. Then we start on your ideas.

**Rules for every agent:** owns only its listed files; no new dependencies; commits on its worktree branch (no force-push, no amend/rebase of pushed commits, never bypass signing); reports what it verified and what it couldn't.

**Cost:** about 7 subagent runs in all (5 builders, 1–2 fixers), never more than 3 at once. Implementers on Sonnet 5.5 with tight briefs; review, integration and playtesting on Opus (me). A deliverable that fails review gets one retry, then I escalate to you. Long runs die if the laptop sleeps, so I'll ask the app to keep it awake during phases 1–3.

## 8. Left to the builders (their call)
Hex orientation and coordinate storage, exact map-growth algorithm, palette and token styling, animation timings, Normal-AI heuristics (within the ≥ 70% target), internal file layout inside their folder.

## 9. Decided with you (16-11-2026)
- Reinforcements are placed at random.
- Dice that don't fit go to a reserve, capped at 64.
- Default game is 8 players (you + 7 AI); setup offers 1–7 AI.
- Later ideas the base must be ready for: hot-seat, touch-first mobile, seeing who is who. Online multiplayer isn't planned.

## 10. Open questions (my default in brackets)
1. **Name and folder.** [`~/Projects/hexdice`, working title "Hexdice"]
2. **Builder model and pace.** [Sonnet 5.5 for builders, up to 3 at once; Opus for me]
3. **Git remote.** [Local only for now]

## 11. Later ideas (parked, from you)
- Hot-seat: several people on one device.
- Touch-first mobile polish.
- Seeing who is who at a glance (beyond colour + emblem + name).
- **Powers or technology research** that you earn, for example by rolling all sixes. How it works is still open.
- **Special fields:** territories that grant powers or research points when captured.

- **Getting dice to the front** (16-11-2026). Random reinforcements pile up on interior territories that can never use them, while the front is always outnumbered because that's where you attack from. Results then depend on the length of your front more than the size of your empire, and luck dominates. Candidate fixes, to be compared in the simulator against the v0.1 rules as config flags:
  1. *Fortify:* once per turn, move dice between two adjacent own territories (at least 1 stays). Most player agency; needs a move gesture and AI logic; may make the leader snowball harder.
  2. *Front-line reinforcement:* new dice land only, or mostly, on territories bordering an enemy (or interior overflow spills to the nearest border). A one-function change in reinforcement, no new UI, turns stay fast.
  3. *Supporting attacks:* neighbouring own territories lend dice to an attack. The biggest change to the odds model.

  How to judge them: Normal-vs-Easy win rate as a proxy for "skill beats luck", comeback rate (does the leader at round 10 still win?), game length, plus a hands-on feel check.
- **Connection bonus** (16-11-2026). Every game starts with your territories scattered as islands. Today joining them only pays off indirectly, through a bigger largest group at the end of the turn. Idea: an explicit, visible bonus the moment a capture joins two or more of your groups. Open questions: how big (flat, or the size of the smaller group joined), and what it grants (dice, or research or power points from the powers idea). One option that also tackles "getting dice to the front": put the bonus dice on the territory that made the link, which is by definition on the front line. The engine can detect it cheaply by comparing group count before and after a capture; it would be judged with the same simulator metrics as above.

- **Effort shouldn't just make you lose faster** (16-11-2026). Reinforcement already happens at the end of your own turn, counted right after your attacks, so conquests pay out at once. What hurts is overextension: every attack leaves its source at 1 die, new dice land at random (mostly behind the front), and then every opponent gets a turn against your thin edge before you act again. Candidate fixes, all simulator-testable:
  1. *Hold the line:* a winning attack leaves dice behind, e.g. half stay and half move in, or the attacker chooses how many move (Risk-style).
  2. *Spoils of war:* each capture this turn adds +1 to your reserve, so effort pays directly.
  3. *Front-line reinforcement* (above) puts the new dice where you just fought.
  Pairs naturally with the `attrition` loss rule, which already stops a failed attack from emptying the stack.

v0.1 keeps the door open without building any of it: roll events carry every die face, territories and players are plain data that can gain a `feature` or `powers` field, and the rules keep attack, reinforcement and turn-advance as separate steps a power could hook into.
