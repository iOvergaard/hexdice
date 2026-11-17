# Improvement plan, 17-11-2026

Jacob asked for an autonomous pass over tests, CI and game features. This is what I'm doing, why, and what's left for him.

## Doing now

| # | Item | Why | How it's proven |
|---|---|---|---|
| T1 | **Keyboard e2e:** Space ends your turn and skips during AI turns, Esc deselects | Never tested by hand or e2e (playtest 16-11) | New `tests/e2e/keyboard.spec.ts`, desktop |
| ~~T2~~ | ~~Cache Playwright's Chromium in CI~~ | **Dropped:** the install step takes 20 s, mostly system packages a cache can't skip; it would save ~10 s of a ~2 min run | Measured from the last CI run |
| T3 | **Pacing script in the repo** (`npm run pacing`) | My wait-between-turns measurement lived in a scratchpad; it found the 26–37 s waits | Script prints seconds per round at each speed |
| F1 | **Seat balance** | In 8-player games the last two seats win 16–17% each against the fair 12.5% (simulator, every run since 16-11) | Tune a starting-dice compensation in the simulator until every seat sits within ±2.5 points of 12.5%; unit test for the rule |
| F2 | **Owner colours on the painted map** | Blue vs cyan and violet vs grey-violet are hard to tell apart on green land (playtest 16-11) | Colour distance (ΔE) of every pair of washed colours, minimum raised; screenshots |
| F3 | **Win-chance badges on targets** | Losing a big stack "with the larger group" surprised you; the odds are already computed | e2e: selecting shows one badge per target with the engine's percentage |
| F4 | **Continue an interrupted game** | A refresh or a phone tab reload loses the game; the deterministic engine makes saving trivial (seed + moves) | Unit tests for save/restore; e2e: play, reload, Continue, same state |

F3 and F4 go to two builder agents in their own worktrees; I do the rest and review/merge everything. All three gates run before anything is pushed.

## Not doing (needs you)

- **Your parked rule ideas** (`docs/plan.md` §11): powers/research, special fields, connection bonus, front-line reinforcement, overextension fixes. Each changes the game's design; I'd prototype one at a time on a branch once you pick.
- **Hot-seat**: the engine supports it; the setup screen and "pass the device" flow are a design call.
- **Hard AI**: worth it once the rules settle, otherwise it gets retuned for every rule change.
- **Visual regression screenshots in CI**: macOS and CI's Linux render fonts differently, so baselines would need to be generated on Linux. Possible, but more moving parts than it's worth right now.
- **Real-device checks** (iPhone sound and silent switch, touch feel): needs your phone.

## Results (17-11-2026)

| # | Outcome |
|---|---|
| Gate | **Game-length gate in CI:** 8-player p90 ≤ 45, p99 ≤ 80, ≤ 2% past 60 rounds over 1,000 games. Today: 35 / 54 / 0.6%. Fails half-stack (p99 239) and attrition (never ends). |
| T1 | **Keyboard e2e:** Space ends your turn, Space skips AI turns, Escape deselects. 3 tests, desktop. |
| T2 | Dropped (see above). |
| T3 | **`npm run pacing`:** Normal 17 s for a heavy first round (22 AI attacks), Fast 7 s. |
| F1 | **Seat compensation:** worst seat was 33.6 points off fair (2 players), 14.7 (3), 4.6 (8); now within ~2–3 points at every size, checked on a second seed set. |
| F2 | **Owner colours:** vermilion `#ff4a1c`, violet `#c060ff`, wash 50%: closest pair ΔE 16.6 → 28.5, contrast on the dark plates kept ≥ 2.9:1. |
| F3 | **Win-chance badges** on every legal target while you have a selection (▲ ≥ 60%, ◆ 40–59%, ▼ < 40%). Unit + e2e tests. |
| F4 | **Continue game** after a reload or tab kill, including the AI's random state, so a continued game plays out exactly as if never interrupted (e2e compares both, with Easy AIs). |

Gates on the final main: 128 unit tests, 2,000-game simulation, 64 browser tests (4 desktop-only skips on the phone project).
