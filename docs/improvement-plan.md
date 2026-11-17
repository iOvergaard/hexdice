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
