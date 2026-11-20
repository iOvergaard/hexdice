# What beats the Normal AI: two strategies in the simulator (20-11-2026)

Jacob beats Easy almost every game, but finds Normal hard. He asked what the difference is, and what a winning strategy looks like. Two ideas came out of that, and this report tests both in the simulator:

1. **Stay under the runaway threshold.** Normal gangs up on anyone holding at least 1.5× the average territory count and at least 8. Can you win more by keeping below that?
2. **Focus on one group** (Jacob's idea). Income only counts your largest group, so leave a second group alone: let it fill to 8 or fall, and spend every attack on the main group.

Nothing ships here: no rule, AI or UI change. It's a record of the numbers for later, for example a Hard AI, which is still a non-goal (`docs/plan.md` §2).

There's no difference in handicap between the levels. The level only chooses the move function (`src/ai/index.ts`), and the engine never reads `aiLevel`. Easy picks a random attack with any chance of winning and ends its turn 10% of the time. Normal scores its attacks (summary in `CLAUDE.md`).

## Method

A throwaway script played one seat, "the hero", against Normal AIs. The hero plays a copy of `src/ai/normal.ts` with a filter on its list of legal attacks, so each variant differs from Normal only in which attacks it may make. In the plain variant the script checked that the copy picks the same move as `chooseAction` every time. It did, across all 6,000 games.

- 6,000 games per variant at 8 players and at 4 players, seeds 200000–205999. Game code at `fe7e060`, the same `src/` as the live `3eb010f`.
- Every variant plays the same seeds, so each game compares directly with plain Normal in the same seat. z is the McNemar statistic on the games where the two disagree: (won only by the variant − won only by plain Normal) ÷ √(sum of both). Above about 2 is unlikely to be chance.
- The hero's seat in turn order comes from the seed, as in a real game, so every seat is covered.

The variants:

| Variant | The hero skips any attack that… |
|---|---|
| Plain Normal | (nothing) |
| under | would make it a runaway if won, while three or more players would be left |
| under-ko | the same, but a capture that knocks a player out is always allowed |
| under-to4 | the same as under, but only while five or more players would be left |
| focus | starts outside its largest group (ties: the group with more dice), unless the capture grows its largest group, which is a link |
| focus-ram | the same, but a full stack of 8 anywhere may attack |
| focus-to4 | breaks both the focus and the under-to4 rule |

The runaway test is the one Normal applies, worked out for the board after the capture. A knockout lowers the player count, which raises the bar:

```ts
function breaches(state, a, variant): boolean {
  const knockout = held(state, dst.owner) === 1;
  const aliveAfter = aliveCount(state) - (knockout ? 1 : 0);
  if (aliveAfter <= 2) return false; // one opponent left: the gang-up changes nothing
  if (variant === 'under-ko' && knockout) return false;
  if (variant === 'under-to4' && aliveAfter <= 4) return false;
  return held(state, me) + 1 >= Math.max(8, (1.5 * territories) / aliveAfter);
}

function offFocus(state, a, variant, main, myGroup): boolean {
  if (main.has(a.from)) return false;
  if (variant === 'focus-ram' && src.dice >= maxDice) return false;
  return largestGroup(withOwner(state, a.to, me), me) <= myGroup;
}
```

With 30 territories, you count as a runaway at:

| Players left | 8 | 7 | 6 | 5 | 4 | 3 |
|---|---|---|---|---|---|---|
| Territories | 8 | 8 | 8 | 9 | 12 | 15 |

## Results

**8 players** (fair share 12.5%):

| Variant | Wins | Only the variant won / only plain won | z | Avg place | Runaway on others' turns | Attacks taken | Rounds |
|---|---|---|---|---|---|---|---|
| Plain Normal | 12.8% | | | 4.49 | 13.9% | 34.5 | 14.8 |
| under | 13.6% | 534 / 486 | 1.5 | 4.30 | 0.6% | 50.2 | 22.3 |
| under-ko | 14.7% | 576 / 463 | 3.5 | 4.27 | 1.1% | 50.3 | 22.6 |
| under-to4 | 16.3% | 634 / 426 | 6.4 | 4.27 | 3.9% | 35.3 | 15.7 |
| **focus** | **21.0%** | 890 / 398 | 13.7 | 3.60 | 16.2% | 40.4 | 15.0 |
| focus-ram | 21.2% | 902 / 400 | 13.9 | 3.60 | 16.3% | 41.1 | 15.1 |
| **focus-to4** | **24.4%** | 1146 / 452 | 17.4 | 3.44 | 4.8% | 40.6 | 16.3 |

**4 players** (fair share 25%):

| Variant | Wins | Only the variant won / only plain won | z | Avg place | Runaway on others' turns | Attacks taken | Rounds |
|---|---|---|---|---|---|---|---|
| Plain Normal | 23.9% | | | 2.51 | 23.3% | 46.0 | 10.6 |
| under | 25.9% | 917 / 794 | 3.0 | 2.43 | 1.1% | 78.7 | 26.7 |
| **focus** | **41.6%** | 1669 / 604 | 22.3 | 2.00 | 27.3% | 49.4 | 11.3 |

At 4 players, under-ko played exactly like under (no knockout ever crossed the bar), and under-to4 and focus-to4 are the same as plain Normal and focus.

**A split start is the norm.** The hero began its first turn with two or more groups in 92% of 8-player games and 99% of 4-player games. Plain Normal won 12.3% of its split starts; focus won 20.7% and focus-to4 23.9%.

## What it means

- **Focus is the big one.** Leaving the second group alone takes the hero from 12.8% to 21.0% in 8-player games and from 23.9% to 41.6% in 4-player games. Plain Normal attacks out of every group at good odds. Those captures add no income, and each one leaves a 1-die stack on a longer front. Left alone, a one-territory group takes its share of new dice until it holds 8. A full 8 is then out of the draw, and Normal leaves it alone unless it can attack with an 8 itself.
- **The full 8 is not worth using.** Letting it attack (focus-ram) adds 0.2 points.
- **Staying under the threshold helps only if you let go in time.** Holding back until four players are left gives +3.5 points. Holding back all game gives +0.8 (could be chance), and games run 50% longer in 8-player and 2.5× longer in 4-player. The hero sits on its cap and takes about 50 attacks instead of 35.
- **The two add up.** Focus makes the hero the runaway a little more often (16.2% of the others' turns, against 13.9%), and the runaway cap makes up for it: 24.4%, almost twice a fair share.
- **For a human in an 8-player game:** grow the group that pays. Hold at most 7 territories while six or more players are in, and at most 8 with five in. Once four are left, go for it.
- **For a future Hard AI:** focus-to4 is a ready-made candidate. It's two filters on Normal's attack list, and it nearly doubles Normal's win rate against Normal.

Caveats: the hero is a Normal clone with filters, not a human, and the table is all Normal. A person picks attacks differently, and Easy tables weren't tested.

## Replaying a seed

`?seed=N&players=8&ai=normal` on the live site starts that exact game at once, skipping the title and the preview. Without `players` and `ai`, the game uses the last title-screen settings. The preview screen shows "Seed N", and a game exported from the save carries it as `config.seed`. From a seed, or better an exported game, the script rebuilds any position the same way the controller does (`makeConfig(defaultSeats(players - 1, ai), seed)`, AI rng `seed ^ 0x9e3779b9`).

To export a game in progress on the live site, run `copy(localStorage.getItem('hexdice:save'))` in the browser console. That copies the config, every action and the AI's random state. The save is deleted at game over. [iOvergaard/hexdice#11](https://github.com/iOvergaard/hexdice/pull/11) (merged 20-11-2026) adds a Copy game button to the end-of-game card.

## Scenarios

| Scenario | Result |
|---|---|
| The hero's copy of Normal plays exactly like `src/ai/normal.ts` | Verified: same move as `chooseAction` at every hero turn in 6,000 games |
| Each variant's effect on the win rate | Verified in the simulator: 6,000 paired games per variant (above) |
| The strategies work for a human player | Not tested: no hands-on games; the hero only stands in for you |
| A seed link starts the same game on the live site | Verified: seed 4242, 8 players, Normal. At your first turn the live board (all 30 territories, owner and dice) matched the headless rebuild exactly, after 11 AI moves |
| The headless rebuild is deterministic | Verified: seeds 4242 and 777001, two runs each, identical boards |
| The same moves give the same dice after your first turn | Not tested live: it follows from the deterministic engine, which resumed saves already rely on. A different move changes the rolls from then on |
| A seed link without `players` and `ai` uses the last title settings | Not tested: read from `start()` in `src/game/controller.ts` |
| A seed link deletes a game in progress | Not tested: read from the code (`newGame()` clears the save). Export first |

No screenshots: this report is simulator numbers and a board comparison. Gates: `check` 204 passed (docs only).
