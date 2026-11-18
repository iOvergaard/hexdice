# How to play panel (18-11-2026)

A "How to play" panel with the rules in plain words and a few tips. It opens from the title screen and from a **?** button in the game bar. Its text is built from the rules the game is played with, so `?link=off` drops the Linking up section and `?reinforce=random` changes where dice land.

![Title, desktop](screens/help-desktop-title.png)
![In game, phone](screens/help-phone-game.png)

| Scenario | Result |
|---|---|
| Opens from the title, shows the default rules (tie to the defender, front line, catch-up linking) | Verified: browser test, desktop and phone |
| Closes with Got it, Escape, × and a tap outside | Verified: Got it and Escape in the title test, tap outside in the game test; × by hand in the browser pane |
| In game, the ? shows the rules of the game in progress (`?link=off`: no Linking up) | Verified: browser test, desktop and phone |
| Space while the panel is open doesn't end your turn | Verified: browser test, and it fails with the guard removed |
| Fits a phone screen and scrolls inside to the tips | Verified: browser test checks it fits at 1280×800 and Pixel 7; scrolled to the end by hand at 375×812 |
| Title layout | Verified by hand: How to play and the speaker sit on their own quiet row under Start, on desktop and at 375 px |
| Game bar on a 375 px phone | Verified by hand: round, speed, ?, speaker and Quit stay on one row up to "Round 39" (13 px spare); phone gaps and padding tightened for it |
| Rules text follows each setting (loss rule, reinforcement, connection bonus, rivers, knockout bonus) | Verified: 8 unit tests in `tests/unit/how-to-play.test.ts` |
| Screen readers | Partly verified: native dialog with a labelled heading, ? has the label "How to play"; not tried with VoiceOver |
| Real phones (iOS Safari) | Not testable here: emulated only |

Gates: `check` 148 passed, `e2e` 70 passed.
