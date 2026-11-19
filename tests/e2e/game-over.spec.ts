import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `playtest/screens/game-over-${info.project.name}-${name}.png` });

/** Autoplays the seeded game to its end; with autoplay every seat, yours too, is played by the AI. */
async function playToEnd(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}&speed=instant&sound=off`);
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.autoplay(true));
  await expect(page.getByTestId('overlay')).toBeVisible({ timeout: 90_000 });
}

test('the ending leads with the winner and shows how the map changed hands', async ({ page }, info) => {
  test.setTimeout(120_000);
  await playToEnd(page, 'seed=42&players=8');
  const end = await page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    const w = s.players[s.winner!]!;
    return { winner: w.kind === 'human' ? 'You win' : `${w.name} wins`, took: w.kind === 'human' ? 'You took' : `${w.name} took`, round: s.round };
  });
  await expect(page.getByTestId('overlay-heading')).toHaveText(end.winner);
  await expect(page.getByTestId('ending-sub')).toHaveText(`${end.took} all 30 territories in ${end.round} rounds.`);
  await expect(page.getByTestId('ending-chart')).toBeVisible();
  // One mark per knocked-out player.
  await expect(page.locator('.end-out')).toHaveCount(7);
  await expect(page.getByTestId('overlay-replay')).toBeFocused();
  await expect(page.getByTestId('overlay-title')).toBeInViewport();
  await page.waitForTimeout(1500);
  await shot(page, info, 'ending');
});

test('the ending fits a 375 px phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await playToEnd(page, 'seed=42&players=8');
  const card = await page.locator('.end-card').boundingBox();
  expect(card!.x).toBeGreaterThanOrEqual(0);
  expect(card!.x + card!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const id of ['overlay-replay', 'overlay-title']) await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
  await page.waitForTimeout(1500);
  await shot(page, info, '375');
});

test('a win stamps your emblem; reduced motion keeps the ending still', async ({ page }, info) => {
  test.setTimeout(120_000);
  // Seed 44 with six players: the AI playing your seat wins.
  await playToEnd(page, 'seed=44&players=6');
  await expect(page.getByTestId('overlay-heading')).toHaveText('You win');
  const animations = () =>
    page.evaluate(() =>
      ['.end-card', '.end-chart', '.end-emblem'].map((sel) => getComputedStyle(document.querySelector(sel)!).animationName),
    );
  expect(await animations()).toEqual(['end-rise', 'end-reveal', 'end-stamp']);
  await page.waitForTimeout(1500);
  await shot(page, info, 'win');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animations()).toEqual(['none', 'none', 'none']);
});

test("a resumed game's ending still covers the moves before the reload", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?seed=42&players=8&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.autoplay(true));
  await page.waitForFunction(() => window.__hexdice!.state()!.players.filter((p) => !p.alive).length >= 2, null, { timeout: 60_000 });
  await page.evaluate(async () => {
    window.__hexdice!.autoplay(false);
    await window.__hexdice!.idle();
  });
  const outBefore = await page.evaluate(() => window.__hexdice!.state()!.players.filter((p) => !p.alive).length);
  expect(outBefore).toBeGreaterThanOrEqual(2);
  await page.goto('/?sound=off');
  await page.getByTestId('continue').click();
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.autoplay(true));
  await expect(page.getByTestId('overlay')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.end-out')).toHaveCount(7);
  await expect(page.locator('.end-axis span').first()).toHaveText('Round 1');
});
