# Roll strip on wide screens (23-11-2026)

Reported: on a 1805 px wide browser the two rolls sat at the far ends of the strip, about 1,400 px apart, so reading who won meant looking from one edge to the other.

Cause: from 720 px the strip is `1fr auto 1fr`; each side stretched to half the strip and packed its name, dice and total against the outer edge. The winner's box filled the whole half.

Change (`src/ui/ui.css`, wide-screen rules only):
- Each side hugs its content and sits against the middle label (`justify-self: end` for the defender, `start` for the attacker), so the two totals and the dice rows meet in the middle at any width. The winner's box now frames just that side.
- From 1120 px the middle label keeps one width (7rem, room for "Tie · captured"), so the sides don't move when the result replaces "vs". Below 1120 px that width would cost an 8 vs 8 roll its dice size, so tablets keep the old minimum.

Phones, phones on their side and tablets keep their layout: die sizes for an 8 vs 8 roll measure the same before and after at 720, 800, 900, 1024, 1099, 1120 and 1280 px.

## Numbers

Gap between the defender's dice and the attacker's dice, 3 vs 2 roll:

| Width | Before | After |
|---|---|---|
| 1280 px | 887 px | under 400 px |
| 1805 px | about 1,400 px | 323 px |

## Scenarios

| Scenario | Result |
|---|---|
| 3 vs 2 capture at 1805 px: rolls sit by the middle (`roll-wide-before-1805-3x2.png`, `roll-wide-after-1805-3x2.png`) | verified |
| 8 vs 8 at 1805 px and 900 px: one row a side, inside the strip (`roll-wide-after-1805-8x8.png`, `roll-wide-after-900-8x8.png`) | verified |
| Real game, seed 11, 1805 px, slow speed: the dice rows stay at the same x from "vs" through "Captured" and "Draw" (sampled every frame) | verified |
| Draw: the defender's winner box hugs the middle too (`roll-wide-hands-held-strip.png`) | verified |
| Phone and landscape phone layouts unchanged | verified (full e2e, desktop and phone) |

## Gates

- `npm run check`: 242 tests pass.
- `npm run e2e`: 126 pass, 10 skipped (desktop-only viewport tests on the phone project). New test: "on a wide screen the two rolls sit together by the middle" (1280, 1805, 2560 px); it fails without the CSS change (887 px at 1280). The 8 vs 8 inside-the-strip test now also runs at 1120, 1280 and 1920 px.
