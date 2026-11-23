import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import { DEFAULT_RULES } from '../../src/engine/config';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

/** Each seat's level, or 'human'; sorted, since turn order is shuffled. */
const levels = () => window.__hexdice!.state()!.players.map((p) => p.aiLevel ?? p.kind).sort();

test('the title offers Easy, Normal and Hard, starts on Normal and remembers Hard', async ({ page }) => {
  await page.goto('/?sound=off');
  await expect(page.locator('[data-testid^="ai-"]')).toHaveText(['Easy', 'Normal', 'Hard']);
  await expect(page.getByTestId('ai-normal')).toHaveAttribute('aria-pressed', 'true');
  const rows = await page.locator('[data-testid^="ai-"]').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(rows).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByTestId('ai-hard').click();
  await page.getByTestId('opponents-3').click();
  await page.getByTestId('start').click();
  await page.getByTestId('preview-yes').click();
  await page.waitForFunction(() => !!window.__hexdice?.state());
  expect(await page.evaluate(levels)).toEqual(['hard', 'hard', 'hard', 'human']);

  await page.evaluate(() => localStorage.removeItem('hexdice:save'));
  await page.goto('/?sound=off');
  await expect(page.getByTestId('ai-hard')).toHaveAttribute('aria-pressed', 'true');
});

test('a save from before Hard keeps its opponents: its Normal players come back as Hard', async ({ page }) => {
  await page.goto('/?sound=off');
  await page.evaluate((rules) => {
    const seats = [{ name: 'You', kind: 'human', identity: 0 }, ...['Atlas', 'Brook', 'Cinder'].map((name, i) => ({ name, kind: 'ai', aiLevel: 'normal', identity: i + 1 }))];
    localStorage.setItem('hexdice:save', JSON.stringify({ v: 1, config: { ...rules, seed: 777, seats }, actions: [] }));
  }, DEFAULT_RULES);
  await page.reload();
  await page.getByTestId('continue').click();
  await page.waitForFunction(() => !!window.__hexdice?.state());
  expect(await page.evaluate(levels)).toEqual(['hard', 'hard', 'hard', 'human']);
});
