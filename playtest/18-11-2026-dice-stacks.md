# Dice stacks and compact territories (18-11-2026)

Jacob asked for territories with 4 or more dice to show two stacks, for more room on the map, because some territories came out as long thin lines, and for a refresh of the die itself.

**Branch:** `feat/dice-stacks` (worktree `.claude/worktrees/dice-stacks`), off main `64a22a6`.
**Played by:** Claude, in headless Chromium at 1280×800 and 375×812 @2x (emulated phone), plus scripted checks against the dev server.

## What changed

- **Dice look:** cubes in a 3/4 view (oblique, not isometric): front face in the owner's colour, a darker side face, a lighter, slightly cool top face on the top die of each stack, and pips on that top die only. The emblem-and-count pill stays beside the dice.
- **Two stacks:** up to 3 dice stand in one stack. 4 to 8 split into two stacks side by side, the left one never shorter: 2+2, 3+2, 3+3, 4+3, 4+4. The token re-centres on its territory as it widens.
- **Compact territories** (`src/engine/mapgen.ts`): each territory now grows into the free frontier hex nearest its seed (plus up to 1 hex of random spread) instead of a random frontier hex. Two relaxation passes then move every seed to its territory's middle and regrow. Grid, territory count and `DEFAULT_RULES` are unchanged, but **every seed gives a different map than before**.

## Options shown to Jacob

Die looks A (today's flat die, two stacks), B (flat with a darker base lip) and C (cube). Map options A (today's generator), B (compact, same grid) and C (compact on a 56×42 grid with dice scaled to keep their screen size). Jacob picked **die C and map B**.

**Polish after an art review** (Jacob: "Polish first"): the pill had become louder than the dice, and the ivory player's top face vanished. Dice grew from 17×15 to 19×17 units, the pill slimmed from 30 to 26, and the top face got a cool tint and a crisper seam. A two-stack token is still 80 units wide.

![Die looks, desktop](screens/dice-stacks-options-dice-desktop.png)
![Die looks, phone](screens/dice-stacks-options-dice-phone.png)
![Map options, desktop](screens/dice-stacks-options-map-desktop-4242.png)
![Map options, phone](screens/dice-stacks-options-map-phone-777.png)

## The result

![Before and after the polish, desktop](screens/dice-stacks-polish-desktop.png)
![Every count from 1 to 8, desktop](screens/dice-stacks-desktop-counts.png)
![Zoomed, desktop](screens/dice-stacks-desktop-zoom.png)
![Every count from 1 to 8, phone](screens/dice-stacks-phone-counts.png)
![Selected with odds, phone](screens/dice-stacks-phone-selected.png)
![Reinforcement label, phone](screens/dice-stacks-phone-reinforce.png)

Also in `screens/`: `dice-stacks-{desktop,phone}-{dealt,selected,after-attack,reinforce}.png`.

## Map shapes

Over 1,000 seeds (300 for main), measured with a throwaway script:

| | main | this branch |
|---|---|---|
| Territories with no inner hex (every hex touches a border: the thin strips) | 20.2% | 8.0% |
| Elongation p50 / p90 / p99 (long axis : short axis) | 1.73 / 2.81 / 4.39 | 1.49 / 2.21 / 3.68 |
| Territory size p10 / p50 / p90, max (hexes) | 12 / 17 / 22, 40 | 14 / 17 / 20, 35 |
| Map generation | 5.3 ms | 11.1 ms |

A unit test now holds the thin share under 10% over seeds 1 to 1,000.

## Tap targets and overlaps

Same 6 seeds (4242, 777, 42, 1, 2026, 31337), 8 players, scripted with `elementFromPoint` on a 3 px grid inside each territory. "Own share" is the part of a territory where a tap selects that territory, either on its land or on its own token. The rest is under a neighbour's token. "All 8" sets every territory to 8 dice, the widest tokens.

| | main, dealt | branch, dealt | main, all 8 | branch, all 8 |
|---|---|---|---|---|
| Desktop: smallest own share / p10 | 0.55–0.77 / 0.76–0.91 | 0.66–0.92 / 0.91–0.94 | 0.49–0.77 / 0.75–0.89 | 0.67–0.82 / 0.81–0.84 |
| Phone: smallest own share / p10 | 0.54–0.70 / 0.71–0.88 | 0.80–0.93 / 0.89–0.95 | 0.53–0.69 / 0.71–0.85 | 0.51–0.74 / 0.72–0.81 |
| Territories under 50% own share | 0 | 0 | 1 (desktop, seed 42) | 0 |
| Token pairs whose tap areas overlap, desktop | 0 | 0 | 0 | 0 |
| Token pairs whose tap areas overlap, phone | 0–1 | 0–2 | 0–1 | 0–6 |

The two columns use different maps for the same seed, so this compares the overall spread, not territory by territory.

## Scenarios

| Scenario | Result |
|---|---|
| 1 to 3 dice stand in one stack, 4 to 8 in two (2+2 … 4+4) | Verified: screenshots of every count on desktop and phone, unit test for the split |
| Count label readable | Verified: same font size as before in a slightly narrower pill (30×46, was 32×48), checked zoomed on desktop and at 375 px |
| The whole territory stays the tap target | Verified: a tap on a territory's land far from its token selects it (desktop click and phone tap, seed 42), and the own-share table above. Tokens still cover part of a neighbour, as before |
| Selection, targets, odds badges, attack | Verified: screenshots on desktop and phone; the selected token still enlarges and the badges sit under the targets |
| Reinforcement "+N" label above the token | Verified: phone and desktop at Slow speed |
| Thin territories | Verified: 20% → 8% with no inner hex (table above); about 2 per map remain on narrow coasts and between rivers |
| Tokens don't overlap each other | Partly verified: none on desktop. On the phone, with every territory at 8 dice, up to 6 pairs' tap areas overlap per board, most by 1–2 px; on seed 2026 a pill covers the top of the stack below it by 14 px (10 px before the polish), though both counts stay readable. Dealt boards: at most 2 pairs, touching by under 1 px |
| Game length on the new maps | Verified: sim below |
| e2e tests that rely on seeded maps | Verified: all pass on the new maps |
| Real phone, touch feel | Not testable here: Chromium emulation only |

## Gates

| Gate | Result |
|---|---|
| `npm run check` | 151 passed (3 new: compactness, stack split) |
| `npm run sim` (500 games) | 0 crashes, illegal moves or cap hits; Normal beats Easy 86.4%; 8-player p50 13, p90 19, p99 30 (limit 33) |
| `npm run sim -- --games 2000` | 0 crashes, illegal moves or cap hits; Normal beats Easy 88.4%; 8-player p50 13, p90 19, p99 27, 0.0% past 60 (`sim-latest.json`) |
| `npm run e2e` | 70 passed, 4 skipped (desktop-only and phone-only tests) |

## Open for Jacob

1. **Saved games across the deploy.** A save is the seed plus the moves, replayed on the seed's map. After this ships, a game saved before the deploy is dropped if its moves no longer fit the new map, or resumes on a different board if they still do. Bumping `VERSION` in `src/game/save.ts` would drop them cleanly. The last-stand rule may need the same bump, so this is best done once, when both are merged.
2. **Old `?seed=` links** now open a different map.
3. **The originality note** in `docs/plan.md` rules out isometric stacks. The cube is a 3/4 oblique view in our palette with our pill, and the plan's unit line now says so; flag it if you read it as too close.
4. **Roll strip dice** (`src/ui/roll-view.ts`) keep their ink-and-outline look. I left them alone because the last-stand session works on the roll strip; they could follow the cube look later.
