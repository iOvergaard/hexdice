# What's new shows only new features and fixes (20-11-2026)

What's new on the title screen now lists only the `feat` and `fix` lines of CHANGELOG.md (New and Fixed). `rules` and `perf` lines stay in the file as the full record, but players no longer see them in the game. The filter is `forPlayers` in `src/changelog.ts`, applied once where the controller reads the file.

## Gates

- `npm run check`: types and 205 unit tests pass.
- `npm run e2e`: 106 passed, 6 skipped, desktop and phone.
- No `sim`: rules and AI are untouched.

## Scenarios

| Scenario | Status | How |
|---|---|---|
| Rules lines are hidden in the game | Verified | `whats-new.spec.ts` checks for no Rules or Faster tags and that "Catch-up connection bonus on by default" is absent. The screenshots below show 90c5c7b (20-11) and 62c0c4d (19-11) gone on desktop and phone. |
| The version still names the newest line shown and marks it | Verified | The e2e test compares the version to the first line. Both screenshots show 373aecc. |
| A day with only rules changes disappears | Partly verified | Unit test only: today's CHANGELOG.md has no such day, so the live dialog can't show it. |
| A rules-only deploy doesn't light the unseen dot | Partly verified | Unit test on `hasUnseen` with the filtered log. No browser run, since that needs a build with a newer rules-only line. |
| CHANGELOG.md keeps its Rules lines | Verified | Only the header sentence changed. The file round-trips through `parseChangelog`/`renderChangelog` unchanged, so the next changelog job won't rewrite it. |

## Screens

![What's new on desktop](screens/whats-new-desktop.png)
![What's new on a phone](screens/whats-new-phone.png)
