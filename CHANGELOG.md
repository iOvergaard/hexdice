# Changelog

What changed in Hexdice, newest first. Players see the New and Fixed lines under What's new on the title screen.

`npm run changelog` adds new `feat`, `rules`, `fix` and `perf` commits on top, each with its commit hash, under the day it reached main. Edit the wording freely, but keep the shape: `## DD-MM-YYYY`, then `- <hash> **New:**`, `**Rules:**`, `**Fixed:**` or `**Faster:**` lines (the hash is optional).

<!-- changelog: up to 080be8814b22d2bb221be45d77a0020aa8d05146 -->

## 23-11-2026

- b8f209c **Fixed:** The title screen asks how many computer opponents you want, so it no longer reads as a count of people playing
- 1967da6 **Fixed:** On a phone on its side the map gets the whole height, with the roll strip and players beside it
- d64a63a **Fixed:** The sea runs on past the map's edge, with no seam on wide screens and phones

## 20-11-2026

- 706f6f0 **Rules:** A territory that holds against you is shaken: a tie against it goes to you for the rest of your turn, and the stack that attacked it can't attack again
- 285f2de **New:** At the end of a turn, new dice wait in a pile and land one at a time
- ed1e255 **Fixed:** Labels over territories at the board's edge are no longer cut off
- bd16ac6 **New:** A crosshair in the player bar marks the runaway the computer players gang up on
- 4d3188d **New:** Every player's territory count in the player bar, under their dice
- cd002ca **Fixed:** A game link opened mid-game no longer replaces your game: the title offers both
- 4970ff0 **Fixed:** Quit keeps your game, so Continue on the title picks it up again
- 038b285 **New:** A territory you just took stays selected, so one more tap attacks on from it
- 85bd30c **New:** What's new shows only new features and fixes
- 373aecc **New:** Copy your game from the end-of-game card, to replay or share it move by move
- 90c5c7b **Rules:** Fairer starting dice by turn order in 3-, 6- and 7-player games

## 19-11-2026

- c268ef3 **New:** Every player's total dice in the player bar, under their income
- 15fb4e7 **New:** A scoreboard at the end of the game: who went out when, attacks won and defences held
- 8da6c22 **New:** Bigger roll dice on tablets
- 62c0c4d **Rules:** Dice that don't fit on your front line go to the territories just behind it
- 1410062 **New:** What's new names your version after the newest change
- 9216efb **Fixed:** Big rolls fit the roll strip on narrow phones and tablets
- c34b66b **Fixed:** The winning roll's tick no longer pushes the result box over the map on phones
- 66c5900 **New:** Title screen shows the painted map and its dice behind the menu
- 1fb2262 **New:** The end of a game leads with the winner's colours and shows how the map changed hands
- 89892ed **New:** Attack rolls show the same cube dice as the board
- d74d06e **New:** What's new shows each change's commit and the build you're playing
- be0f5bf **New:** AI players gang up on a runaway leader
- c5d918d **New:** What's new shows when each change arrived
- 47c9f2f **New:** Play offline after your first visit; new versions arrive the next time you open it online
- 2d49e68 **New:** What's new on the title screen
- 7c440fb **New:** Dice in two stacks, cube dice and compact territories

## 18-11-2026

- 53dc2fa **New:** Show the last stand on the board and explain it in How to play
- deb5154 **New:** Last stand for the smaller of the last two players
- 19436e2 **New:** How to play panel on the title screen and in game
- 8b94e67 **New:** Favicon, home-screen icons, manifest and link previews
- 1962b1d **Rules:** Catch-up connection bonus on by default
- 790e06f **New:** Front-line reinforcement is the default

## 17-11-2026

- 9073d00 **New:** A bigger, bolder board
- 0efac8b **New:** Seat compensation so turn order doesn't decide the game
- 6d63409 **Fixed:** Owner colours you can tell apart on the painted map
- 70afe43 **Fixed:** A continued game plays out exactly as if never reloaded
- 71b4c09 **New:** Continue an interrupted game
- 95c440b **New:** Win-chance badges on attack targets
- 2285118 **New:** Synthesised sound effects with a speaker toggle
- a6c26ef **New:** Rivers you can only cross at a ford
- eb118df **New:** A "big bang" when a player is knocked out

Hexdice went online on 17-11-2026.
