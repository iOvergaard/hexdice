# Hexdice

Browser dice-conquest strategy game by Jacob (iOvergaard/hexdice, MPL-2.0), live at https://hexdice.snebold.dk. Our own game in the genre: never copy an existing game's name, logo, art, typography or look. Vite + TypeScript, SVG board, plain DOM UI, no runtime dependencies.

## Commands

```bash
npm run dev                  # http://localhost:5180 (browser pane: .claude/launch.json "hexdice")
npm run check                # tsc + Vitest            (gate 1)
npm run sim -- --games 500   # headless AI vs AI + game length (gate 2; CI runs 2000)
npm run e2e                  # Playwright desktop+phone (gate 3), own dev server on E2E_PORT (default 5190)
npm run changelog            # add new player-facing commits to CHANGELOG.md (`-- --check`: fail if it's behind)
npm run pacing               # seconds you wait between turns per speed; needs `npm run dev` running
npm run icons                # regenerate favicon, home-screen icons and link-preview image from scripts/icons.ts
npm run build
```

- `sim` flags: `--games`, `--seed`, `--out`, `--loss-rule`, `--reinforcement`, `--connection`, `--last-stand <dice>`, `--elimination-bonus`.
- Several sessions often run at once. If port 5190 is taken, run `E2E_PORT=5197 npm run e2e`.

## Docs

- `docs/plan.md`: the approved design. §3 is the authoritative rule set, and each rule there records when it changed and why. §11 lists parked ideas with their candidate fixes.
- `docs/implementation-plan.md`: v0.1 tasks, interfaces and file ownership. `docs/improvement-plan.md`, `docs/sound-proposal.md`: earlier plans.
- `playtest/`: hands-on reports (`DD-MM-YYYY-<change>.md`) and `sim-latest.json`. `playtest/screens/` is gitignored; reports reference the images anyway.
- `CHANGELOG.md`: what players see under What's new (below).

## Architecture

```
src/engine/   pure TS, no DOM. types.ts (the contract), rng, hex, config, seats, mapgen, setup, rules, odds
src/ai/       pure TS. chooseAction(state, level, rng): easy.ts, normal.ts
src/ui/       SVG board (board-view, terrain, units), roll strip, HUD/player bar, screens, panels (how-to-play, whats-new)
src/game/     controller (screen flow, turn flow, animation queue, busy lock, replay), save, sound, URL params, timing
src/changelog.ts  parse and write CHANGELOG.md (pure) · src/main.ts entry · src/debug.ts dev-only window.__hexdice
scripts/      sim, stats (length limits), changelog, pacing, icons
tests/        unit (Vitest), e2e (Playwright), fixtures (state builders)
```

- Engine API: `createGame(config)`, `legalAttacks(state)`, `applyAction(state, action) → { state, events }`. Human and AI submit the same `Action`.
- The UI renders state and animates events; it never decides rules. A new rule adds an event (`GameEvent` in `types.ts`); the controller (`play()` in `src/game/controller.ts`) animates it after the others.
- `src/engine/types.ts`, `rng.ts`, `hex.ts`, `config.ts`, `seats.ts` and `tests/fixtures/` are the shared contract. Change them deliberately, never as a side effect.
- Saves (`src/game/save.ts`) are the config plus the action log, replayed on load. A new rule setting must replay older saves without it: default it to off in `restore`, as `connectionBonus` and `lastStandDice` do. Any change to map generation changes every seeded map, so older saves stop loading. Say so before shipping it.
- `src/ui/how-to-play.ts` builds the rules text from `RulesConfig`. Update it with every rule change; a unit test bans em dashes.
- `odds.ts` covers 1–8 dice per side; `winProbability` throws beyond that.

## Rules in force (summary; §3 of the plan wins)

30 territories on a generated continent with lakes and rivers crossable only at fords. Attacks need 2+ dice; both sides roll all their dice and ties go to the defender (equal stacks win under 50%). A failed attack drops to as many dice as the defender had (losing at least 1) on a draw, and to 1 on a loss (`drawAttrition`). Ending your turn gives one die per territory in your largest connected group, +1 per player you knocked out. New dice only land on territories that border an enemy, max 8 per territory, and the overflow goes to a reserve (max 64). Catch-up connection bonus: +2 dice per extra group joined, only for players below the average territory count. Last stand: the first time a turn ends with two players left (in a game that started with three or more), the one with fewer territories gets +1 die on each territory. Seat compensation adjusts starting dice by turn order (its own table under the catch-up bonus).

Normal AI (`src/ai/normal.ts`): attacks at ≥ 50% odds (≥ 30% from a full stack of 8). It prefers captures that grow its largest group, shrink the leader's group or knock someone out, and ends its turn when no good attack is left. Easy attacks at random. Jacob finds Normal hard enough. A Hard AI is parked.

## Conventions

- Engine and AI are deterministic: no DOM, `window`, timers or `Math.random()`. All randomness goes through `Rng`, whose state lives in `GameState.rngState`. Same seed + same actions = same game.
- `applyAction` never mutates its input; `config` and `board` are immutable after `createGame`.
- Hex grid: pointy-top, odd-r offset, cell = `row * width + col`, directions E, SE, SW, W, NW, NE = 0..5.
- Input: pointer events only, nothing hover-only, the whole territory is the tap target. Must stay playable on a phone: the title row and the game bar (round, speed, ?, sound, Quit) each fit one row at 375 px.
- Test hooks: `data-territory="<id>"` on territories, `data-testid` on controls, `window.__hexdice` in dev (`state`, `actions`, `events`, `attack`, `endTurn`, `autoplay`, `load`, `idle`, `sounds`). E2E tests set up a position with `__hexdice.load(state)`; see `tests/e2e/link.spec.ts` and `last-stand.spec.ts`.
- URL params for tests and repro links: `?seed= &players= &ai=easy|normal &speed=slow|normal|fast|instant &sound=on|off &reinforce= &link=`.
- `import type` for types (`verbatimModuleSyntax`). No new dependencies without asking Jacob, and don't upgrade any unprompted.
- UI copy in British English, no em dashes; dates DD-MM-YYYY.
- Local storage keys start with `hexdice:` (title options, save, sound, changelog-seen). Wrap every access in try/catch.

## Changing the rules or the AI

1. Measure first. Use a throwaway script in your scratchpad that imports `src/` by absolute path and plays AI games the way `scripts/sim.ts` does (AI rng `seed ^ 0x9e3779b9`). Inject a candidate rule into the state from outside the engine, or copy the AI.
2. Show Jacob the numbers, the options with their trade-offs, and your pick. He decides; never ship a rule he hasn't chosen.
3. Build it as a `RulesConfig` setting with unit tests first, a `sim` flag and, if he should try it, a URL param. Turn it on by default only on his call.
4. Update §3 of the plan, How to play, the save default, `sim-latest.json` and a playtest report with the before and after numbers.

The balance metrics used so far:
- Normal-vs-Easy win rate (skill over luck);
- comeback rates: the leader at round 5 and round 8, and the smaller of the last two;
- game length (`scripts/stats.ts`);
- wins per seat in turn order.

## Playtest gates (every change)

| Change | Gates |
|---|---|
| Rules or AI | `check`, `sim`, short hands-on |
| UI or flow | `check`, `e2e`, hands-on |
| Anything else | `check` at least |

The simulation fails on any crash, illegal move or 1,000-round cap hit, Normal beating Easy under 70%, or eight-player games running long: p90 over 26 rounds, p99 over 33, or more than 0.5% past 60 (`scripts/stats.ts`). The length limits sit about 50% above front-line reinforcement (p90 17, p99 22; with today's defaults p90 19, p99 27) and fail random reinforcement and every rule that caused endless standoffs.

A hands-on report goes in `playtest/DD-MM-YYYY-<change>.md` with screenshots and every scenario marked verified, partly verified or not testable (with why). Bug reports carry the seed and the action log (`__hexdice.actions()`).

## Commits and What's new

Commits follow Conventional Commits (`type(scope): subject`). `feat`, `rules`, `fix` and `perf` commits are player-facing: `npm run changelog` copies their subject, after the colon and capitalised, into `CHANGELOG.md`, and the title screen's What's new shows that file.

- Write player-facing subjects for players, in British English. One change per commit.
- Everything else uses `docs`, `chore`, `test`, `ci`, `refactor`, `style` or `proto`, and stays out of the changelog.
- A prototype that becomes the default needs its own `feat` or `rules` commit, or players never hear of it.
- `CHANGELOG.md` keeps hand edits: polish wording or add a missing change by hand. Keep the shape: `## DD-MM-YYYY`, then `- HH:MM **New:**`, `**Rules:**`, `**Fixed:**` or `**Faster:**` lines. The time is optional on hand-added lines.
- Each line carries the Danish time it reached main. A branch's commits take the time of the merge that brought them in, so generate the changelog on main after merging, not on the branch.
- Every session documents its own work: whatever it merges to main lands in `CHANGELOG.md` in the same push.
- History before the first deploy (`ce33ad5`) isn't listed.
- CI on main runs `npm run changelog -- --check`, so a push with an unlisted player-facing commit fails before deploying. The changelog check and the commit history need `fetch-depth: 0` in CI; keep it.

## Git and deploys

- `main` is the integration branch. Feature work happens on branches (`feat/…`, `fix/…`, `proto/…`) or in agent worktrees under `.claude/worktrees/`.
- Merge with `git merge --no-ff <branch> -m "Merge <branch>: <summary>"`. After the merge, run `npm run changelog` and commit it as `chore(changelog): …`.
- Every push to main tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`: check, changelog check, sim of 2,000 games, e2e, then deploy). So **ask Jacob before every push to main**, and before merging into it.
- After a push, `gh run watch <id> --exit-status`. Then confirm the live site serves the new bundle: `curl -s https://hexdice.snebold.dk/` gives the `assets/index-*.js` name, and that bundle contains the new text.
- Never force-push, never amend or rebase pushed commits, never bypass commit signing. Delete merged local branches only when Jacob says so (`git branch -d`).
