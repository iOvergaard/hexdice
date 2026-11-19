# Hexdice

Browser dice-conquest strategy game, run locally. Our own game in the genre: never copy an existing game's name, logo, art, typography or look. Vite + TypeScript, SVG board, plain DOM UI, no runtime dependencies.

## Commands

```bash
npm run dev                  # http://localhost:5180 (browser pane: .claude/launch.json "hexdice")
npm run check                # tsc + Vitest            (gate 1)
npm run sim -- --games 500   # headless AI vs AI + game length (gate 2; CI runs 2000)
npm run e2e                  # Playwright desktop+phone (gate 3), own dev server on E2E_PORT (default 5190)
npm run pacing               # seconds you wait between turns per speed; needs `npm run dev` running
npm run build
```

## Docs

- `docs/plan.md`: the approved design. §3 is the authoritative rule set; §11 lists parked ideas.
- `docs/implementation-plan.md`: v0.1 tasks, interfaces and file ownership.
- `playtest/`: hands-on reports (`DD-MM-YYYY-<change>.md`), `screens/`, `sim-latest.json`.

## Architecture

```
src/engine/  pure TS, no DOM. types.ts (the contract), rng, hex, config, seats, mapgen, setup, rules, odds
src/ai/      pure TS. chooseAction(state, level, rng)
src/ui/      SVG board, roll strip, HUD/player bar, screens, selection logic
src/game/    controller (screen flow, turn flow, animation queue, busy lock, replay), URL params, timing
src/main.ts  entry · src/debug.ts dev-only window.__hexdice test hook
src/offline/ service worker (production builds only); scripts/offline.ts writes dist/sw.js with the build's file list
scripts/sim.ts · tests/unit (Vitest) · tests/e2e (Playwright) · tests/fixtures (state builders)
```

- Engine API: `createGame(config)`, `legalAttacks(state)`, `applyAction(state, action) → { state, events }`. Human and AI submit the same `Action`.
- The UI renders state and animates events; it never decides rules.
- `src/engine/types.ts`, `rng.ts`, `hex.ts`, `config.ts`, `seats.ts` and `tests/fixtures/` are the shared contract. Change them deliberately, never as a side effect.

## Conventions

- Engine and AI are deterministic: no DOM, `window`, timers or `Math.random()`. All randomness goes through `Rng`, whose state lives in `GameState.rngState`. Same seed + same actions = same game.
- `applyAction` never mutates its input; `config` and `board` are immutable after `createGame`.
- Hex grid: pointy-top, odd-r offset, cell = `row * width + col`, directions E, SE, SW, W, NW, NE = 0..5.
- Input: pointer events only, nothing hover-only, the whole territory is the tap target. Must stay playable on a phone.
- Test hooks: `data-territory="<id>"` on territories, `data-testid` on controls, `window.__hexdice` in dev.
- `import type` for types (`verbatimModuleSyntax`). No new dependencies without asking Jacob.
- UI copy in British English; dates DD-MM-YYYY.

## Playtest gates (every change)

| Change | Gates |
|---|---|
| Rules or AI | `check`, `sim`, short hands-on |
| UI or flow | `check`, `e2e`, hands-on |
| Anything else | `check` at least |

The simulation fails on any crash, illegal move or 1,000-round cap hit, Normal beating Easy under 70%, or eight-player games running long: p90 over 26 rounds, p99 over 33, or more than 0.5% past 60 (`scripts/stats.ts`). The length limits sit about 50% above front-line reinforcement (p90 17, p99 22; with the catch-up connection bonus, today's default, p90 19, p99 26) and fail random reinforcement and every rule that caused endless standoffs.

A hands-on report goes in `playtest/DD-MM-YYYY-<change>.md` with screenshots and every scenario marked verified, partly verified or not testable (with why). Bug reports carry the seed and the action log (`__hexdice.actions()`).

## Git

`main` is the integration branch; feature work happens on branches or agent worktrees and is merged after review. Never force-push, never amend or rebase pushed commits, never bypass commit signing.
