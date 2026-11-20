# Shaken becomes the default (20-11-2026)

Jacob played games with `?shaken=on` and asked how it works: "I shook up some fields in this game but subsequent attacks also failed and didn't leave them weaker per se." Being shaken takes no dice. The only bonus is that a tie against a shaken territory goes to the attacker, so 8 against 8 goes from 47% to 53%.

His call, after the numbers below: turn it on by default as it is, because the markers show which territories you've already tried. No bonus beyond the tie.

## His game

Replayed from his copied game (seed 2064882774, 7 players, Normal): he shook 13 defenders, most of them Atlas's stacks of 8, and attacked a shaken one 6 times. 3 of those won, and none of the 6 rolls was a tie, so the rule decided no roll for him. He held 10 territories to Atlas's 20 at the start of round 6, and won in round 13.

In 1,000 eight-player all-Normal games, a tie against a shaken defender decided 518 rolls: about one every two games, shared by all eight players, or 0.19% of attacks.

## A stronger shaken, measured and dropped

The tie is the same as +1 on the attacker's total, so +2, +3 and +4 against a shaken defender were measured. A scratchpad copy of `rules.ts` and the AIs played them (the AIs knew the odds), on the CI seeds plus 11,000 fresh games each. The copy reproduced the sim exactly with the rule off and at +1, and the copied AIs matched `chooseAction` on every move.

| | Off | Tie (+1, kept) | +2 | +3 | +4 |
|---|---|---|---|---|---|
| 4 vs 4 / 8 vs 8, shaken | 46% / 47% | 54% / 53% | 62% / 59% | 69% / 64% | 76% / 69% |
| Normal beats Easy (4,000 duels) | 89.4% | 88.7% | 87.6% | 86.7% | 86.0% |
| 8p p90 / p99, CI seeds | 22 / 31 | 22 / 33 | 22 / 32 | 21 / 29 | 21 / 29 |
| Longest game, fresh 8p / 4p | 142 / 32 | 57 / 33 | 38 / 30 | 40 / 30 | 65 / 109 |
| Smaller finalist (6+) wins, 8p / 4p | 28.3 / 31.9% | 29.3 / 35.1% | 29.4 / 34.6% | 30.1 / 35.4% | 24.8 / 35.9% |
| Attacks on a shaken defender that win | – | 68% | 74% | 80% | 80% |
| Rolls decided by the bonus | – | 0.22% | 0.42% | 0.60% | 0.88% |

Each step costs about a point of Normal-vs-Easy. Length and comebacks stay within noise up to +3, and +4 starts to drag out (a 4-player game of 109 rounds). The recommendation was to leave the rule off, since it fixes no measured problem; Jacob kept it for the markers.

## Before and after

`npm run sim -- --games 2000` (the CI seeds):

| | Before (off) | After (default) |
|---|---|---|
| Normal beats Easy | 907/1000 (90.7%) | 886/1000 (88.6%) |
| 8-player p50 / p90 / p99, max | 14 / 22 / 31, 42 | 14 / 22 / 33, 47 |
| Past 60 rounds | 0 | 0 |
| 8-player wins per seat | 106–156 of 1,000 | 95–168 of 1,000 |

The p99 headroom under the limit of 36 drops from five rounds to three. The CI seeds' seat spread is noisy at 1,000 games; on 3,000 fresh games per size it was 11.1–14.0% (8 players), 22.0–27.2% (4) and 31.6–36.2% (3) with the rule on, against 11.1–13.6%, 22.5–26.4% and 31.4–36.3% off.

## Scenarios

| Scenario | Result |
|---|---|
| New games play with it, without a URL param | Verified: unit test on the defaults; `shaken.spec.ts` now runs on a plain game link and checks the rule is on, then plays a draw (spent, shaken, "Shaken!"), the 54% badge and a tie capture, on desktop and phone. Not by hand: the browser pane was hidden, so its animations didn't run |
| `?shaken=off` still turns it off | Verified: unit test of the URL params (unchanged) |
| Games saved before the rule existed replay without it | Verified: unit test (unchanged) |
| How to play and the README explain it with the default rules | Verified: unit test; README read through |
| The end-of-game "biggest upset" rates a tie win against a shaken territory at its real odds | Verified: the summary test now checks against the shaken odds; it failed with the old check once games had shaken on |
| Two browser tests that relied on a seed's ending still find it | Verified: the AI games play out differently now, so "You were eliminated" uses seed 8 (out in round 9, was seed 3) and the win stamp uses seed 4 (your seat wins in round 8, was seed 45), found with a scratch replay of the controller's set-up |

Gates: `check` 237 passed; `sim -- --games 2000` passed (numbers above); `e2e` 122 passed and 6 skipped (desktop and phone).
