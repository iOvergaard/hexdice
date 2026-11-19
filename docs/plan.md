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
- Hex grid, default 44 × 33 cells. Territories are contiguous blobs of cells; the rest is sea. One continent with bays and peninsulas and open sea around it (Jacob's choice, 16-11-2026): about 33–40% land, no land on the grid edge.
- Default 30 territories. Every territory has ≥ 6 cells. The territory adjacency graph is connected (one landmass), and no single territory is the only link between two regions larger than 3 territories (such bridges made endgames drag for 100+ rounds).
- **Rivers** (added 17-11-2026, from Jacob): 2 one-cell-wide rivers of 10–17 cells run from the coast inland, never touching lakes or each other, each with one ford (a land cell drawn as a bridge). Water blocks adjacency, so territories can only meet across a river at its ford.
- **Lakes** (added 16-11-2026, from Jacob): 3 inland lakes of 4–9 cells (they may merge), never touching the open sea. Territories can't border across water, so lakes create chokepoints and defensible spots.
- Two territories are adjacent if any of their cells share an edge.

**Setup**
- Players: 2–8, default 8 (you + 7 AI). Seat order is random, then fixed *(my call: fair on average)*.
- Territories are dealt at random, as evenly as possible.
- Every player starts with the same total dice, T = floor(3 × territories ÷ players) (30 territories, 8 players → 11). Each territory gets 1 die; the player's remaining dice are placed on random own territories, max 8 per territory.
- **Seat compensation** (17-11-2026): moving first is a big edge in small games (2 players: the first seat won 84% of AI-vs-AI games) and moving last in big ones (8 players: the last seat won 17%). Starting dice are adjusted by seat in turn order (`SEAT_COMPENSATION` in `src/engine/setup.ts`; 2 players: first seat −7; 8 players: +1 for the fifth seat, −1 for the last two). Tuned and checked on separate seed sets: every seat within about 2–3 points of a fair share. Rechecked 19-11-2026 on the rules of that day (all-Normal, two sets of 3,000 games per size): 2, 4, 5 and 8 players are within noise, but three seats sit at the edge of that range: the last seat in 3-player games wins 36–37% (fair share 33.3%), the first in 6-player games 14.8% (16.7%) and the first in 7-player games 11.6–11.9% (14.3%). Retuning is Jacob's call. Setting: `seatCompensation`.

**A turn**
- The active player makes any number of attacks, then ends the turn.
- **Attack:** from an own territory with ≥ 2 dice into an adjacent enemy territory. Attacker rolls all dice in the source, defender all dice in the target (d6 each). Attacker wins only on a strictly higher sum; ties go to the defender. What a failed attack (loss or draw) costs the attacking stack is the `lossRule` setting (from Jacob): `classic` (drops to 1), `attrition` (drops to the defender's dice, losing at least 1, never below 1), `drawAttrition` (attrition on a draw, classic on a clear loss) or `halfStack` (loses half, rounded up). On continent maps `attrition` and `halfStack` produce games that never end (failures too cheap); `drawAttrition` matches `classic` on game length (1,200 games, 17-11-2026: p99 54 vs 56 rounds). **Default: `drawAttrition`** (Jacob, 17-11-2026). Draws are about 3.5% of attacks.
  - Win: target changes owner; source dice − 1 move into it; source keeps 1. (A source holds at most 8, so the target never gets more than 7.)
  - Loss or draw: the source pays what the loss rule says (under the default `drawAttrition`: a draw drops it to the defender's dice, losing at least 1; a clear loss drops it to 1); the target is unchanged.
- A player who loses their last territory is eliminated; their reserve is discarded.
- **Reinforcement (end of turn):** amount = number of territories in the player's largest connected group of own territories, plus their reserve, plus the **knockout bonus**: +1 die per turn, permanently, for each opponent the player has eliminated (`eliminationBonus`, added 16-11-2026, from Jacob). Dice are placed one at a time, at random, on own territories with < 8 dice; with the default `frontline` setting only on territories facing an enemy, with what doesn't fit going behind the front (`frontlineOverflow`, below). Leftovers go to the reserve, capped at 64.
  Where the dice land is the `reinforcement` setting (17-11-2026): `random` (any own territory with room), `frontline` (**default since 18-11-2026**, Jacob's call after playing it: only territories facing an enemy; what doesn't fit went to the reserve until 19-11-2026, see below) or `weighted` (those three times as likely). Try one with `?reinforce=frontline`. Simulated (8 players, all-Normal): frontline halves game length (median 22 → 12 rounds, 99% within 22 instead of 54), keeps skill expression (Normal beats Easy 90%), and gives more comebacks (the halfway leader wins 62% instead of 77%).
  What happens to front-line dice that don't fit is the `frontlineOverflow` setting (**default `behind` since 19-11-2026**, Jacob's call): they go to the territories just behind the front, nearest it first (ties at random), and wait in the reserve only once every territory is full. `reserve` sends them straight to the reserve, as before. Why: with a short front line, most of all in the final, the leader banked 8 to 11 dice that sat unused until the front moved. Simulated (2,000 games, same seeds): Normal beats Easy 90.7% either way, 8-player p90 22 and p99 31 (32 with the reserve), the round-5 leader wins 40% either way, and the smaller finalist with 6+ territories wins 29–30% (26–31% with the reserve, within noise). Saves from before replay with `reserve`.
- **Connection bonus** (`connectionBonus`, **default `catchup` since 18-11-2026**, Jacob's call): when a capture joins two or more of your separate groups, you get +2 dice per extra group joined, placed on the capturing territory (overflow to the reserve). Under `catchup` only a player holding fewer territories than the average of the players still alive earns it, counted as the capture is made: before the territory changes hands and before any knockout it causes. A gold "+N linked!" shows it. Other values: `off`, `flat` (anyone earns it) and `smaller` (the size of the smaller groups); try one with `?link=`. Simulated (8 players): catch-up gives more comebacks (the halfway leader wins 58.6% instead of 62.3%) for about 2 points of skill expression (Normal beats Easy 87–88% instead of 90%) and one extra round (median 13). Small games use their own seat compensation under it (2 players −5, 3 players −2/−1/+1, 4 players none). Saves from before the bonus replay with it off.
- **Last stand** (`lastStandDice`, **default 1 since 18-11-2026**, Jacob's call): the first time a turn ends with only two players left, in a game that started with three or more, the one holding fewer territories gains +1 die on each of their territories (up to 8; nobody gets it on a tie). Knocking out both of your last two rivals in one turn skips it, a strategy Jacob wants to keep. A gold "Last stand!" shows it. Simulated (2,000 Normal games per size): when the smaller finalist still holds 6 or more of the 30 territories, they win 32% (4 and 8 players) to 39% (3 players) instead of 20–23%; on 5 or fewer they stay at 0%. Seat balance and game length don't move. Considered and dropped: +2 dice (39–57%), filling every territory to 6 or 8 (41%, 70%), and ongoing help in the final (extra income changed nothing; an extra defence die needs odds past 8 dice). Saves from before replay without it.
- **Game over:** one player owns every territory. If you're eliminated: defeat screen with "watch the rest" or "new game".

**Odds:** the engine precomputes the exact win probability for every a-vs-d dice matchup (1–8 each). The AI uses it, and the board shows it as an odds badge on each target once you pick an attacker.

**Normal AI and runaways** (19-11-2026, Jacob's call): the Normal AI treats an opponent holding at least 1.5× the average territories of the players still in, and at least 8, as a runaway, and adds +0.6 to the score of any attack on them. Cutting the leader's largest group now counts 0.15 per territory instead of 0.06. The table gangs up on whoever pulls away, you included. Jacob chose this over rule changes (less income for big empires, more for players below the average): those made a formed runaway beatable only by pushing games past the length gate. Simulated (7 players, all-Normal, two sets of 1,500 games): a leader with 15 or more of the 30 territories at round 5 appears in 9% of games instead of 14%, and at round 8 in 43–45% instead of 56–58%. Once formed, it still wins 86–87%. Eight players: p90 22, p99 30–32 (was 19 and 26–27). Normal beats Easy 88.7–90.7%. Details in `playtest/19-11-2026-ai-gang-up.md`.

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
- **Sound** (added 17-11-2026, from Jacob; see `docs/sound-proposal.md`): synthesised cues on one native Web Audio context, no assets and no dependency. `cuesFor(events, …)` in `src/game/sound-cues.ts` decides which sounds an action makes, and the controller plays them alongside the animations. No animation means no sound, so Instant and skipping are silent. AI rolls are quiet at Slow and Normal and silent from Fast, and a replay keeps only knockouts and the final sting. The your-turn chime and the win/lose stings play at every speed. Audio starts on the first tap or key press. A speaker toggle in the HUD and on the title screen is remembered as `hexdice:sound` (on by default). The iOS silent switch is respected.
- **Randomness:** seeded PRNG (mulberry32-style, no dependency) whose state lives inside `GameState`. State is plain JSON, so replays and repro files come free.
- **URL params:** `?seed=42&players=6&ai=normal&speed=instant` start a game directly (used by tests and repro links). `&sound=off` mutes that visit without changing the remembered setting.
- **Debug hook** (dev builds only): `__hexdice.state()`, `.attack(from, to)`, `.endTurn()`, `.autoplay(true)`, `.sounds()` (the cues that played).
- **Dependencies:** vite, typescript, vitest, @playwright/test, tsx. Nothing at runtime.

**UI v0.1** (screen flow from your reference screenshots, 16-11-2026; our own visual style throughout, no copied logo, dice art or typography):
- **Title screen:** game name, player-count chips "2 players" … "8 players" (total including you; default 8, last choice remembered), AI level, Start. Behind the menu (from 19-11-2026, Jacob's pick of three directions): a dealt board, always seed 2026 with six players, built a frame after the menu paints and never a tap target. On a phone it shows above and behind the name with the menu on ink below; on a wide screen it fills the right and fades out under the menu on the left.
- **How to play** (added 18-11-2026, from Jacob): a panel opened from the title screen and from the ? in the game bar. Its text is built from the rules in play (`helpSections(rules)` in `src/ui/how-to-play.ts`), so `?reinforce=` and `?link=` change what it says. It is a native modal dialog: Escape, the backdrop, × and Got it close it, and Space doesn't end your turn behind it.
- **Board preview:** the generated board with owners and starting dice, "Play on this map?" Yes / No. No generates a new board (new seed). The seed is shown small, for repro.
- **Game screen, top to bottom:**
  - **Roll strip** (on top so it stays in view on phones; your call, to be confirmed in playtests). The defender is on the left and the attacker, the active player, is **always on the right**. Each side shows its dice faces (pips, in the player's colour, with their emblem) and its sum. The dice tumble briefly, then settle; the winning side is emphasised. The attacking territory and its target are highlighted on the board meanwhile.
  - **Board.**
  - **Player bar:** one chip per player in turn order with emblem, colour and largest-group number (plus reserve when > 0). The current player is highlighted, eliminated players greyed out, your chip marked "You". End turn button and speed control sit beside it.
- **Game over overlay** across the board: "You win" / "You were eliminated" / "<name> wins", buttons **Title** and **Replay**. If you're eliminated while the game continues, a third button: **Watch the rest**. Since 19-11-2026 (Jacob picked it from three directions after an art review found the old band underplayed) it's a card: a header in the winner's colour with their emblem (yours stamps in when you win), a chart of the territories each player held, round by round, with a mark where each one went out, and a line about your game (biggest turn and knockouts if you won; how big you got, who finished you and where you came if you didn't). It covers the whole screen on a phone. `src/game/summary.ts` reads all of it from the event log.
- **Replay:** plays the finished game back from its seed and move log at fast speed, read-only. Cheap because the engine is deterministic.

**Map look** (merged 16-11-2026 after the `proto/painted-map` prototype): a painted landscape in our own style. Sea shaded by depth with surf and waves, smooth sandy coasts and lake shores with hex steps kept between territories, painted meadow with trees, hills and rocks, owner shown as a colour wash plus darkened borders. The view zooms to the continent; on a portrait screen the board rotates 90° to fill it. **Units:** dice in the owner's colour, drawn as cubes in a 3/4 view (oblique, not isometric) with a count-and-emblem label. Up to 3 dice stand in one stack; 4 or more split into two stacks side by side (Jacob, 18-11-2026). `?units=cluster|banners` keeps the two alternatives for comparison.

Click own territory (≥ 2 dice) to select and highlight valid targets; click a target to attack; Esc deselects; Space ends turn (and skips ahead during AI turns). *(My call:)* the 8 player colours differ in lightness as well as hue; each player's emblem (a simple shape) sits on their dice tokens; the player panel and roll result always show colour, emblem and name. A richer "who is who" treatment is one of your later ideas.

## 6. Playtesting: how every change gets proven

| Gate | Command | Passes when |
|---|---|---|
| 1. Unit | `npm run check` (tsc + Vitest) | Engine invariants hold: territory count constant, dice always 1–8 per territory, adjacency symmetric, attack/reinforcement/elimination/victory correct on fixture maps, odds table matches brute force. |
| 2. Simulation | `npm run sim -- --games 500` | 0 crashes, 0 illegal actions, every game ends before a 1,000-turn cap, Normal beats Easy in ≥ 70% of 1v1 games (seat order alternated). If it falls short, the AI gets tuned; the threshold only moves with your OK. Since 17-11-2026 also a game-length gate on eight-player games (CI runs 2,000 games); since 18-11-2026, with front-line reinforcement and the catch-up connection bonus as defaults (p90 19, p99 26): p90 ≤ 26 rounds, p99 ≤ 33, at most 0.5% past 60. Stats (game length, seat win rates) saved to `playtest/sim-latest.json` so balance shifts show up between changes. |
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
- **Connection bonus** (16-11-2026; prototype on `proto/connection-bonus`, findings in `playtest/18-11-2026-connection-bonus.md`: the flat and smaller-group sizes make the game more snowbally; the catch-up version, paid only to players below the average territory count, is the one that adds comebacks. **Built and the default since 18-11-2026**, see §3). Every game starts with your territories scattered as islands. Today joining them only pays off indirectly, through a bigger largest group at the end of the turn. Idea: an explicit, visible bonus the moment a capture joins two or more of your groups. Open questions: how big (flat, or the size of the smaller group joined), and what it grants (dice, or research or power points from the powers idea). One option that also tackles "getting dice to the front": put the bonus dice on the territory that made the link, which is by definition on the front line. The engine can detect it cheaply by comparing group count before and after a capture; it would be judged with the same simulator metrics as above.

- **Effort shouldn't just make you lose faster** (16-11-2026). Reinforcement already happens at the end of your own turn, counted right after your attacks, so conquests pay out at once. What hurts is overextension: every attack leaves its source at 1 die, new dice land at random (mostly behind the front), and then every opponent gets a turn against your thin edge before you act again. Candidate fixes, all simulator-testable:
  1. *Hold the line:* a winning attack leaves dice behind, e.g. half stay and half move in, or the attacker chooses how many move (Risk-style).
  2. *Spoils of war:* each capture this turn adds +1 to your reserve, so effort pays directly.
  3. *Front-line reinforcement* (above) puts the new dice where you just fought.
  Pairs naturally with the `attrition` loss rule, which already stops a failed attack from emptying the stack.

v0.1 keeps the door open without building any of it: roll events carry every die face, territories and players are plain data that can gain a `feature` or `powers` field, and the rules keep attack, reinforcement and turn-advance as separate steps a power could hook into.
