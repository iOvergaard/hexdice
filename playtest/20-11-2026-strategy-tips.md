# Strategy tips in How to play (20-11-2026)

Two tips from [the strategy report](20-11-2026-strategy-sim.md) are now in the Tips list of How to play (`src/ui/how-to-play.ts`) and the README:

- **Focus:** attack from your largest group.
- **Stay under the bar:** stay just under the size the computer players gang up on (1.5× the average territory count, at least 8) until four players are left. Worded in territories held, so it reads the same with or without the player-bar runaway mark.

Also fixed in the strategy report: PR 11 is merged, not "(open)".

The tips are advice, not guarantees: the simulator used a Normal-AI copy, not a human.

## Scenarios

| Scenario | Result |
|---|---|
| Both tips show in How to play on the title screen, desktop 1280 px | Verified: [screenshot](screens/20-11-2026-strategy-tips-desktop.png) |
| Same at 375 px, no horizontal overflow | Verified: [screenshot](screens/20-11-2026-strategy-tips-phone.png), page width 375 |
| Tips appear in How to play opened mid-game | Not tested: same `helpSections` call as the title screen |
| Tips appear with every rule preset | Partly verified: default rules only; the unit test `section('Tips', ...)` still passes for the other presets |
| No em dashes in the new copy | Verified: unit test and grep |
| README Tips mirror How to play | Verified by reading both |
| The advice helps a human player | Not testable here: no human games, see the strategy report |

Gates: `check` 204 passed; `e2e` (desktop and phone) 106 passed, 6 skipped. No sim run: no rule or AI change.
