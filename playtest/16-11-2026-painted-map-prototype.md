# Playtest 16-11-2026: painted-map prototype

**Branch:** `proto/painted-map` (main + continent maps + painted landscape and unit visuals + PM fixes). Not merged into main.
**Played by:** Claude (PM): browser pane at 1280×800, headless Chromium at 1280×800 @2x and Pixel 7, plus simulator runs.
**Try it:** `?units=stack`, `?units=cluster` (default) or `?units=banners` on any game URL, e.g. `/?seed=777&players=8&speed=normal&units=stack`.

## Automated gates

| Gate | Result |
|---|---|
| `npm run check` | 89 passed |
| `npm run sim -- --games 500` | 0 crashes / illegal / cap hits; Normal beats Easy 90.4%; 8-player avg 24.0 rounds, max 144 |
| `npm run e2e` | 45 passed, 1 skipped |

## What the prototype adds

- **Continent maps** (44×33 grid, ~36% land): one landmass with bays, peninsulas, lakes and open sea; irregularity +42% vs the old maps; no land on the grid edge.
- **Painted landscape:** sea shaded by depth with surf and waves, smooth sandy coast and lake shores, painted meadow with trees, hills and rocks; territory borders keep their hex steps; owner shown as a colour wash plus darkened borders.
- **Unit visuals:** three switchable styles (cluster, stack, banners), all keeping count + emblem.
- **Phone portrait:** the board rotates 90° to fill the height.

## Scenarios

| Scenario | Status | Notes |
|---|---|---|
| Desktop board readability | Verified | Owner washes + borders + tokens readable; zoom shows painted detail. |
| Phone board size | Verified (emulated) | Fixed: board now fills the width and most of the height (was ~350×160 px). |
| Phone roll strip | Verified (emulated) | 8 vs 8 fits on one row per side; strip keeps one height so the board never jumps. |
| Tap select / attack on the zoomed board | Verified | Selection, targets, arrow and capture all line up. |
| Reinforcement labels after token nudging | Verified | "+N" centred above the right tokens. |
| Skip to my turn | Verified | 1.1 s to your next turn at Slow speed. |
| Game length on continent maps | Partly verified | See finding 3. |
| Real phone, touch feel | Not testable here | Chromium emulation only. |

## Findings and what I did

1. **Map was mostly sea on screen.** The view now crops to the continent plus a sea margin and fills the box shape. Fixed.
2. **Tokens overlapped** where territory centres sit close together. Overlapping tokens are now nudged apart (at most 1.6 hexes). Fixed.
3. **Long games on continent maps.** Single-territory land bridges let two big empires trade one chokepoint for 100+ rounds (8-player, 400 games: p99 146, max 292; old maps p99 34). Maps with such a bridge are now rejected: p99 57, max 66. The simulator's own seeds still produced one 144-round game, so a rarer tail remains (2-territory necks). Partly fixed.
4. **The `attrition` loss rule never ends on continent maps.** With failures cheap, endgames churn forever: some games hit the 1,000-round cap (p90 41–90 rounds). A variant where the defender also loses a die was worse. On the old compact maps attrition was fine (p99 35). Open: recommend keeping `classic` as the default.
5. **Pacing (fixed on main, inherited here).** Waiting between your turns at Normal was 26–37 s; AI attacks now animate faster and the button offers "Skip to my turn": 14–19 s, or about 1 s with skip.
6. **Owner washes are muddy on green.** Blue vs cyan and violet vs grey-violet are hard to tell apart from the land alone; tokens and borders carry identity. Open.
7. **Wave strokes turn vertical in portrait.** Minor, open.
8. **Painted details are small on a phone.** Minor, open.

## Decisions for Jacob

- Which unit style becomes the default. PM recommendation: **stack** (dice stand on the land; least "label-like").
- Merge `proto/painted-map` into main, or iterate further first.
- Default loss rule: PM recommendation **classic** (finding 4).
