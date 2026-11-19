// README screenshots from a seeded game, so they can be refreshed whenever the look changes.
// Usage: npm run dev (in another terminal), then: npm run screenshots -- [--url http://localhost:5180] [--seed 1234] [--round 4]
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
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
const seed = Number(arg('seed', '1234'));
const round = Number(arg('round', '4'));
const players = Number(arg('players', '6'));
const out = arg('out', 'docs/screenshots');

/** Lets the AIs play every seat until `round`, then hands you your turn with your biggest stack selected. */
async function midGame(page: Page): Promise<void> {
  await page.goto(`${url}/?seed=${seed}&players=${players}&speed=instant&sound=off`);
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.autoplay(true));
  await page.waitForFunction((r) => (window.__hexdice!.state()?.round ?? 0) >= r, round, { timeout: 120_000 });
  await page.evaluate(() => window.__hexdice!.autoplay(false));
  await page.waitForFunction(
    () => {
      const s = window.__hexdice!.state();
      return !!s && s.winner === null && s.players[s.current]!.kind === 'human';
    },
    undefined,
    { timeout: 120_000 },
  );
  await page.evaluate(() => window.__hexdice!.idle());
  const from = await page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    const me = s.current;
    const ready = s.territories.filter((t) => t.owner === me && t.dice >= 2 && t.neighbours.some((n) => s.territories[n]!.owner !== me));
    if (ready.length === 0) throw new Error('You have nothing to attack with; try another --seed or --round');
    return ready.sort((a, b) => b.dice - a.dice)[0]!.id;
  });
  await page.getByTestId(`token-${from}`).click();
  // Show the speed players normally pick, not the instant one used to get here.
  await page.getByTestId('speed').selectOption('normal');
  await page.waitForTimeout(300);
  const held = await page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    return s.territories.filter((t) => t.owner === s.current).length;
  });
  console.log(`${page.viewportSize()!.width}px: you hold ${held} territories at round ${round} (seed ${seed})`);
}

const browser = await chromium.launch();
try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desktop.goto(url);
  await desktop.getByTestId('title').waitFor();
  await desktop.screenshot({ path: `${out}/title.jpg`, type: 'jpeg', quality: 85 });
  await midGame(desktop);
  await desktop.screenshot({ path: `${out}/game-desktop.jpg`, type: 'jpeg', quality: 85 });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await midGame(phone);
  await phone.screenshot({ path: `${out}/game-phone.jpg`, type: 'jpeg', quality: 85 });
  console.log(`Screenshots in ${out}/ (seed ${seed}, round ${round}, ${players} players)`);
} finally {
  await browser.close();
}
