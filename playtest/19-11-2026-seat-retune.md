# Seat retune for 3, 6 and 7 players (19-11-2026)

The rules review found turn order mattering more than plan §3 claims in 3-, 6- and 7-player games. The tables were tuned on 17-11, before front-line reinforcement, catch-up, the last stand, overflow behind the front and the gang-up AI. Jacob asked for a retune.

## Change

New tables under catch-up (`SEAT_COMPENSATION_CATCHUP_2`, setting `seatTables: 2`), starting dice per seat in turn order:

| Players | Before | After |
|---|---|---|
| 3 | −2, −1, +1 | −2, −1, 0 |
| 6 | −1, 0, 0, 0, 0, 0 | all 0 |
| 7 | 0, +1, 0, 0, 0, 0, 0 | +1, +1, 0, 0, 0, 0, 0 |

2, 4, 5 and 8 players are unchanged. In 7-player games the first two seats start with 5 of the 30 territories, the rest with 4, so they also sit above the average and can't earn the catch-up bonus. Saves from before replay with the old tables (`seatTables: 1` in `restore`).

## Numbers

All-Normal games, win share by seat in turn order. Candidates were picked on one set of 6,000 games per size (seeds 100000+) and checked on two fresh sets of 6,000 (300000+ and 700000+). The table pools the two fresh sets (12,000 games; one standard error is about 0.4 points).

| Players | Fair share | Before | After |
|---|---|---|---|
| 3 | 33.3 | 31.2, 31.6, **37.2** | 34.3, 33.6, 32.3 |
| 6 | 16.7 | **15.6**, 16.9, 16.8, 17.1, 16.3, 17.4 | 16.7, 17.0, 16.5, 16.4, 17.0, 16.7 |
| 7 | 14.3 | **12.2**, 14.0, 15.2, 15.1, 14.9, 14.6, 14.3 | 14.4, 13.1, 14.5, 14.4, 14.8, 14.3, 14.8 |

Worst seat in either fresh set: 3 players 1.9 points off (was 4.4), 6 players 0.7 (was 1.5), 7 players 1.4 (was 2.3).

Also tried, on the selection set: 3 players −1/−1/0 (first seat 38%), −1/0/0, −2/0/0; 6 players +1 or −1 on a single seat (2.5 and 1.5 off); 7 players +1 on the first seat only, +2/+1, and +1/+1 with −1 for the last (1.6 to 1.7 off). 7 players +1/+2 did as well as +1/+1 over all three sets (1.0 against 1.4 at worst, the first seat now low instead of the second); +1/+1 adds fewer dice and treats both 5-territory seats alike.

Game length doesn't move (median and p90 rounds: 3 players 8 and 13, 6 players 12 and 20, 7 players 13 and 21). The CI simulation (8 players and Normal-vs-Easy duels) is unchanged: Normal beats Easy 90.7%, p90 22, p99 31.

| Scenario | Result |
|---|---|
| Seat shares within about 2 points for 3, 6 and 7 players | Verified: two fresh sets of 6,000 games per size |
| Starting dice per seat follow the new tables for every size | Verified: unit test, 20 seeds per size |
| A 7-player game starts the first two seats on 13 dice and the rest on 12; a 3-player game on 28, 29 and 30 | Verified hands-on in the browser (seed 7) |
| Saves from before the retune replay with the old tables | Partly verified: unit tests for the `restore` default and the old tables; no real old save loaded in the browser |
| Browser tests | Verified: 100 passed, 6 skipped. The game-over win test moved from seed 44 to 45, since 6-player games now play out differently |

Gates: `check` 204 passed, `sim --games 2000` passed, `e2e` 100 passed.
