# Hexdice

A dice-conquest strategy game for the browser. Conquer a hex map by rolling against your neighbours, and grow your largest connected region to earn reinforcements.

**Play:** https://hexdice.snebold.dk (deployed from `main` after the tests pass).

<p align="center">
  <img src="docs/screenshots/game-desktop.png" alt="A game in progress on a laptop: a painted continent split into six players' territories, each with its dice; your stack of five is selected and the neighbour you can attack shows a 72% chance of winning" width="760">
</p>

<p align="center">
  <img src="docs/screenshots/game-phone.png" alt="The same game on a phone, with the map turned upright and the player bar below it" width="250">
  &nbsp;
  <img src="docs/screenshots/title.png" alt="The title screen: choose 2 to 8 players and the AI level, then Start; How to play and What's new sit underneath" width="480">
</p>

```bash
npm install
npm run dev     # http://localhost:5180
```

Rules and design: [docs/plan.md](docs/plan.md). Developer notes: [CLAUDE.md](CLAUDE.md).

The screenshots come from a seeded game: with `npm run dev` running, `npm run screenshots` takes them again.
