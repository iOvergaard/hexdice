# Hexdice

Browser dice-conquest strategy game by Jacob (iOvergaard/hexdice, MPL-2.0), live at https://hexdice.snebold.dk. Our own game in the genre: never copy an existing game's name, logo, art, typography or look. Vite + TypeScript, SVG board, plain DOM UI, no runtime dependencies.

## Commands

```bash
npm run dev                  # http://localhost:5180 (browser pane: .claude/launch.json "hexdice")
npm run check                # tsc + Vitest             (gate 1)
npm run sim -- --games 500   # headless AI vs AI + game length (gate 2; CI runs 2000)
npm run e2e                  # Playwright desktop + phone (gate 3), own dev server on E2E_PORT (default 5190)
npm run changelog            # add new player-facing commits to CHANGELOG.md (`-- --check`: fail if it's behind)
npm run pacing               # seconds you wait between turns per speed; needs `npm run dev` running
npm run icons                # regenerate the icons and link-preview image from public/favicon.svg
npm run screenshots          # README screenshots from a seeded game (docs/screenshots/); needs `npm run dev` running
npm run build
```

- `sim` flags: `--games`, `--seed`, `--out`, `--loss-rule`, `--reinforcement`, `--overflow`, `--connection`, `--last-stand <dice>`, `--elimination-bonus`, `--seat-tables`.
- Several sessions often run at once. If port 5190 is taken, run `E2E_PORT=5197 npm run e2e`.

## Docs

- `docs/plan.md`: the approved design. §3 is the authoritative rule set, with the reason for each rule. §11 lists parked ideas. The other files in `docs/` are earlier plans.
- `playtest/`: hands-on reports and `sim-latest.json`. `playtest/screens/` is gitignored; reports reference the images anyway.

## Architecture

```
src/engine/   pure TS, no DOM. types.ts (the contract), rng, hex, config, seats, mapgen, setup, rules, odds
src/ai/       pure TS. chooseAction(state, level, rng): easy.ts, normal.ts
src/ui/       SVG board (board-view, terrain, units), roll strip, HUD, screens, panels (how-to-play, whats-new)
src/game/     controller (screen flow, turn flow, animation queue, busy lock, replay), save, sound, URL params, timing
src/offline/  service worker, production builds only; the Vite plugin in scripts/offline.ts writes dist/sw.js
src/changelog.ts  parse and write CHANGELOG.md (pure) · src/main.ts entry · src/debug.ts dev-only window.__hexdice
scripts/      sim, stats (length limits), changelog, pacing, icons, offline
tests/        unit (Vitest), e2e (Playwright), fixtures (state builders)
```

- Engine API: `createGame(config)`, `legalAttacks(state)`, `applyAction(state, action) → { state, events }`. Human and AI submit the same `Action`.
- The UI renders state and animates events; it never decides rules. A new rule adds a `GameEvent` (`types.ts`), and `play()` in `src/game/controller.ts` animates it.
- Shared contract: `src/engine/types.ts`, `rng.ts`, `hex.ts`, `config.ts`, `seats.ts` and `tests/fixtures/`. Change them deliberately, never as a side effect.
- Saves (`src/game/save.ts`) are the config plus the action log, replayed on load. A new rule setting must default to off in `restore`, as `connectionBonus` and `lastStandDice` do, so older saves replay without it.
- A change to map generation changes every seeded map, so older saves stop loading. Say so before shipping it.
- `src/ui/how-to-play.ts` builds the rules text from `RulesConfig`. Update it with every rule change; a unit test bans em dashes. The README's "How to play" mirrors it for the defaults (plus the odds table and the computer players), so update both.
- `odds.ts` covers 1–8 dice per side; `winProbability` throws beyond that.

## Rules in force (summary; §3 of the plan wins)

- Board: 30 territories on one continent. Lakes and rivers block adjacency; a river is crossed only at its ford.
- Attack: needs 2+ dice. Both sides roll all their dice; ties go to the defender, so equal stacks win under 50%.
- Failed attack (`drawAttrition`): a draw drops the stack to the defender's dice count (losing at least 1), a loss drops it to 1.
- End of turn: one die per territory in your largest connected group, +1 per player you knocked out. New dice land only on territories bordering an enemy, max 8 each. What doesn't fit goes to the territories just behind the front, nearest it first (`frontlineOverflow: 'behind'`), and only then to a reserve (max 64).
- Connection bonus (`catchup`): +2 dice per extra group a capture joins, only for players below the average territory count.
- Last stand: the first time a turn ends with two players left (in a game that started with three or more), the one with fewer territories gets +1 die on each.
- Seat compensation adjusts starting dice by turn order.

Normal AI (`src/ai/normal.ts`):
- Attacks at ≥ 50% odds (≥ 30% from a full stack of 8).
- Prefers captures that grow its largest group, shrink the leader's group or knock someone out.
- Gangs up on a runaway: anyone holding at least 1.5× the average territory count (and at least 8) gets +0.6 on every attack against them, the human included.
- Ends its turn when no such attack is left, unless all its border stacks are full; then it takes the best odds on offer.

Easy attacks at random. Jacob finds Normal hard enough; a Hard AI is parked.

## Conventions

- Engine and AI are deterministic: no DOM, `window`, timers or `Math.random()`. All randomness goes through `Rng`, whose state lives in `GameState.rngState`. Same seed + same actions = same game.
- `applyAction` never mutates its input; `config` and `board` are immutable after `createGame`.
- Hex grid: pointy-top, odd-r offset, cell = `row * width + col`, directions E, SE, SW, W, NW, NE = 0..5.
- Input: pointer events only, nothing hover-only, the whole territory is the tap target.
- Phone: the title row and the game bar (round, speed, ?, sound, Quit) each fit one row at 375 px.
- Test hooks: `data-territory="<id>"` on territories, `data-testid` on controls, `window.__hexdice` in dev (`state`, `actions`, `events`, `attack`, `endTurn`, `autoplay`, `load`, `idle`, `sounds`). E2E tests set up a position with `__hexdice.load(state)`; see `tests/e2e/link.spec.ts` and `last-stand.spec.ts`.
- URL params for tests and repro links: `?seed= &players= &ai=easy|normal &speed=slow|normal|fast|instant &sound=on|off &reinforce=random|frontline|weighted &link=off|flat|smaller|catchup`.
- `import type` for types (`verbatimModuleSyntax`). No new dependencies without asking Jacob, and don't upgrade any unprompted.
- UI copy in British English, no em dashes; dates DD-MM-YYYY.
- Local storage keys start with `hexdice:` (`title`, `save`, `sound`, `changelog-seen`). Wrap every access in try/catch.

## Changing the rules or the AI

1. Measure first. Use a throwaway script in your scratchpad that imports `src/` by absolute path and plays AI games the way `scripts/sim.ts` does (AI rng `seed ^ 0x9e3779b9`). Inject a candidate rule into the state from outside the engine, or copy the AI.
2. Show Jacob the numbers, the options with their trade-offs, and your pick. He decides; never ship a rule he hasn't chosen.
3. Build it as a `RulesConfig` setting with unit tests first, a `sim` flag and, if he should try it, a URL param. Turn it on by default only on his call.
4. Update §3 of the plan, How to play, the save default, `sim-latest.json` and a playtest report with the before and after numbers.

Balance metrics: Normal-vs-Easy win rate (skill over luck), comeback rates (the leader at round 5 and round 8, and the smaller of the last two), game length (`scripts/stats.ts`) and wins per seat in turn order.

## Playtest gates (every change)

| Change | Gates |
|---|---|
| Rules or AI | `check`, `sim`, short hands-on |
| UI or flow | `check`, `e2e`, hands-on |
| Anything else | `check` at least |

The simulation fails on:
- any crash, illegal move or 1,000-round cap hit;
- Normal beating Easy in under 70% of the duels;
- eight-player games running long: p90 over 26 rounds, p99 over 33, or more than 0.5% past 60 (`LENGTH_LIMITS` in `scripts/stats.ts`).

Today's defaults give p90 22 and p99 31 on the CI seeds, so p99 has two rounds of headroom.

A hands-on report goes in `playtest/DD-MM-YYYY-<change>.md` with screenshots and every scenario marked verified, partly verified or not testable (with why). Bug reports carry the seed and the action log (`__hexdice.actions()`).

## Commits and What's new

Commits follow Conventional Commits (`type(scope): subject`). `feat`, `rules`, `fix` and `perf` commits are player-facing: `npm run changelog` copies their subject, capitalised, into `CHANGELOG.md`, and the title screen's What's new shows that file.

- Write player-facing subjects for players, in British English. One change per commit.
- Everything else uses `docs`, `chore`, `test`, `ci`, `refactor`, `style` or `proto`, and stays out of the changelog.
- A prototype that becomes the default needs its own `feat` or `rules` commit, or players never hear of it.
- `CHANGELOG.md` keeps hand edits. Keep the shape: `## DD-MM-YYYY`, then `- <hash> **New:**`, `**Rules:**`, `**Fixed:**` or `**Faster:**` lines. The hash is optional on hand-added lines.
- A PR with a player-facing commit carries its own `CHANGELOG.md` update. Run `npm run changelog` on the branch as its last commit (`chore(changelog): …`), right before the PR merges. CI runs `npm run changelog -- --check` on every PR and on main, and fails if a player-facing commit is unlisted.
- A change sits under the day (Danish time) it was committed on its branch. That's the day it reaches main, unless the PR waits overnight: then run the changelog again before merging.
- Once one PR's changelog merges, every other open PR that ran the changelog conflicts on `CHANGELOG.md`. Merge `origin/main` into it, keep main's file (`git checkout --theirs CHANGELOG.md`), commit, then run `npm run changelog` again and commit that.
- The check reads the commit history, so keep `fetch-depth: 0` in CI. History before the first deploy (`ce33ad5`) isn't listed.
- What's new names the version you're on: the hash of the newest change in the build (`currentVersion` in `src/changelog.ts`), and marks that line. The exact commit a deploy came from is in `/version.txt`.

## Git and deploys

- `main` is the integration branch. Every task gets its own branch (`feat/…`, `fix/…`, `ci/…`, `proto/…`, or a session's worktree branch) and its own pull request to main.
- Open the PR with `gh pr create` once the gates pass locally, with the Claude Code footer at the end of the body. Bind it to your session (`bind_pr`), so the app archives the session when the PR merges.
- Every PR runs the three jobs of `.github/workflows/deploy.yml` side by side: check, changelog check and sim of 2,000 games; e2e on desktop; and e2e on phone. All three must pass before it merges. The merge to main runs them again, then deploys to GitHub Pages, which writes the commit it came from to `/version.txt`.
- Merge with a merge commit, `gh pr merge <n> --merge --subject "Merge <branch>: <summary>"`. Never squash or rebase, since the changelog reads main's merge commits.
- On CI a failed browser test gets one retry. One that passes on the retry shows as flaky in the run's annotations: fix it, don't live with it.
- Its `paths` filter skips pushes to main that only touch Markdown (except `CHANGELOG.md`), `LICENSE`, `docs/`, `playtest/`, `.claude/` or `.github/FUNDING.yml`. Add new non-game paths there. To deploy anyway, run the workflow by hand.
- **Ask Jacob before every push to main**, and before merging into it. Merging a PR counts.
- After a merge or push, `gh run watch <id> --exit-status`. If it deployed, `curl -s https://hexdice.snebold.dk/version.txt` prints the commit you pushed.
- Never force-push, never amend or rebase pushed commits, never bypass commit signing.
- Clean up after yourself once your work is merged and deployed: `git worktree remove` your worktree, delete your merged local branches with `git branch -d`, and stop the dev servers you started (Jacob, 19-11-2026). Never `git branch -D`, never delete remote branches, and leave other sessions' worktrees and branches alone.
