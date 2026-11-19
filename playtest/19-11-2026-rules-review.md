# Rules review (19-11-2026)

Jacob asked for an independent review of the rules. A Fable agent compared plan §3, How to play, the README and CLAUDE.md with the engine and both AIs, and ran its own simulations. No engine bug found. The docs had drifted in a few places, now fixed.

## Fixed in this change

- README: Easy "picks only fights it can win" was wrong. Its filter keeps any attack with a chance above zero, and every legal attack has one (2 into 8: 0.0005%). It now says Easy attacks at random, even against long odds.
- How to play and README: the last-stand line now says why finishing both rivals matters: with three left, knocking out one hands the smaller of the last two a last stand.
- CLAUDE.md: the CI seeds give p99 31, not 32 (two rounds of headroom under 33).
- `types.ts` and plan §3: front-line overflow no longer says it goes straight to the reserve; plan §3 says the odds badge exists and when catch-up eligibility is counted.
- Plan §3 and `setup.ts`: seat balance rechecked (below).
- New unit tests: catch-up at exactly the average, a link that also knocks a player out, a link bonus with a full reserve, a turn that knocks out two players and leaves two, and Easy attacking at long odds and sometimes ending early. Breaking the `<` in the catch-up check, or making Easy skip long odds, fails them.

## Seat balance on today's rules

All-Normal, two sets of 3,000 games per size (seeds 500000+ and 900000+); win share by seat in turn order.

| Players | Off the fair share | Set A | Set B | Fair share |
|---|---|---|---|---|
| 3 | last seat | 37.0% | 35.7% | 33.3% |
| 6 | first seat | 14.8% | 14.8% | 16.7% |
| 7 | first seat | 11.6% | 11.9% | 14.3% |

2, 4, 5 and 8 players are within noise (one set each). Not changed: retuning is Jacob's call, and new starting dice could stop games saved before it from loading. A likely cause for 7 players, not tested: 30 territories don't divide by 7, so the first two seats start with 5 territories against 4, the same dice spread thinner, and above the average, so out of reach of the catch-up bonus.

## Left as is

- `normal.ts` fallback for when every border stack is full can't be reached: a full stack of 8 always has at least 47%, which passes the 30% rule.
- The last stand emits an event with no dice placed when the smaller finalist is full everywhere (already pinned by a test).
- No per-seat fairness gate in CI beyond the 8-player printout.

## Coverage

| Scenario | Result |
|---|---|
| README odds table matches `odds.ts` | Verified: all 56 cells to the whole percent |
| Dice, reserve, income, overflow order, catch-up, last stand and knockout invariants | Verified: 27,000 all-Normal games, 2 to 8 players, zero violations |
| Save and restore replay identically | Verified in the same games |
| Map generation (30 territories, connected, at least 6 cells each) | Verified: 6,000 maps |
| Normal's attack thresholds and the runaway bonus | Verified with built positions |
| Replaying a real save from before today's map change | Not testable: none at hand |

Gates: `check` 202 passed; the How to play and last-stand browser tests pass on desktop and phone.
