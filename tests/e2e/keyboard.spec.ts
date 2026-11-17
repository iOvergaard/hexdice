import { expect, test, type Page } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

/** Waits until it's the human's turn, with nothing focused so key presses reach the game, not a button. */
async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__hexdice);
  await page.evaluate(() => window.__hexdice!.idle());
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test.beforeEach(({}, info) => {
  test.skip(info.project.name === 'phone', 'Keyboard shortcuts are a desktop feature');
});

test('Space ends your turn', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=instant');
  await ready(page);
  const startRound = await page.evaluate(() => window.__hexdice!.state()!.round);
  await page.keyboard.press('Space');
  await page.evaluate(() => window.__hexdice!.idle());
  const s = await page.evaluate(() => window.__hexdice!.state()!);
  expect(s.round).toBe(startRound + 1);
  expect(s.players[s.current]!.kind).toBe('human');
});

test('Escape clears the selection', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=instant');
  await ready(page);
  const from = await page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    return s.territories.find((t) => t.owner === s.current && t.dice >= 2 && t.neighbours.some((n) => s.territories[n]!.owner !== s.current))!.id;
  });
  await page.getByTestId(`token-${from}`).click();
  await expect(page.locator(`[data-territory="${from}"]`)).toHaveClass(/is-selected/);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-territory].is-selected')).toHaveCount(0);
});

test('Space skips the AI turns', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=slow');
  await ready(page);
  const startRound = await page.evaluate(() => window.__hexdice!.state()!.round);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('end-turn')).toHaveText('Skip to my turn');
  const started = Date.now();
  await page.keyboard.press('Space');
  await page.evaluate(() => window.__hexdice!.idle());
  expect(Date.now() - started).toBeLessThan(5_000);
  expect(await page.evaluate(() => window.__hexdice!.state()!.round)).toBe(startRound + 1);
});
