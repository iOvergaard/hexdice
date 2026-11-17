// Measures how long you wait between your turns, per speed, in a real browser against the dev server.
// Usage: npm run dev (in another terminal), then: npm run pacing -- [--url http://localhost:5180] [--speeds normal,fast] [--rounds 2]
import { chromium } from '@playwright/test';
import { winProbability } from '../src/engine/odds';
import { legalAttacks } from '../src/engine/rules';
import type { GameState } from '../src/engine/types';
import type { HexdiceDebug } from '../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const url = arg('url', 'http://localhost:5180');
const speeds = arg('speeds', 'normal,fast').split(',');
const rounds = Number(arg('rounds', '2'));
const seed = Number(arg('seed', '9001'));
const players = Number(arg('players', '8'));

const browser = await chromium.launch();
try {
  for (const speed of speeds) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${url}/?seed=${seed}&players=${players}&speed=${speed}&sound=off`);
    await page.waitForFunction(() => !!window.__hexdice);
    const idle = () => page.evaluate(() => window.__hexdice!.idle());
    const state = () => page.evaluate(() => window.__hexdice!.state()!) as Promise<GameState>;
    const aiAttacks = () => page.evaluate(() => window.__hexdice!.events().filter((e) => e.type === 'attackRolled').length);

    let t0 = performance.now();
    await idle();
    const waits: string[] = [`first ${((performance.now() - t0) / 1000).toFixed(1)} s`];
    for (let r = 0; r < rounds; r++) {
      // Play a sensible turn: take every attack with at least a 60% chance.
      for (let i = 0; i < 30; i++) {
        const s = await state();
        if (s.winner !== null || s.players[s.current]!.kind !== 'human') break;
        const best = legalAttacks(s)
          .map((a) => ({ ...a, p: winProbability(s.territories[a.from]!.dice, s.territories[a.to]!.dice) }))
          .sort((x, y) => y.p - x.p)[0];
        if (!best || best.p < 0.6) break;
        await page.evaluate(([f, t]) => window.__hexdice!.attack(f!, t!), [best.from, best.to]);
        await idle();
      }
      const s = await state();
      if (s.winner !== null || !s.players.find((p) => p.kind === 'human')!.alive) break;
      const before = await aiAttacks();
      t0 = performance.now();
      await page.evaluate(() => window.__hexdice!.endTurn());
      await idle();
      waits.push(`round ${r + 1} ${((performance.now() - t0) / 1000).toFixed(1)} s (${(await aiAttacks()) - before} AI attacks)`);
    }
    console.log(`${speed.padEnd(7)} ${waits.join(' · ')}`);
    await page.close();
  }
} finally {
  await browser.close();
}
