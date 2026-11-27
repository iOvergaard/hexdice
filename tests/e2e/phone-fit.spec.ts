import { expect, test, type Page } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

/** Starts a game at this size and measures it: whether the page scrolls, where End turn ends, the board's height. */
async function fit(page: Page, size: { width: number; height: number }, players: number, seed: number) {
  await page.setViewportSize(size);
  await page.goto(`/?seed=${seed}&players=${players}&speed=instant&sound=off`);
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  return page.evaluate(() => ({
    vh: window.innerHeight,
    scrollH: document.documentElement.scrollHeight,
    endBottom: document.querySelector('[data-testid=end-turn]')!.getBoundingClientRect().bottom,
    board: document.querySelector('.board-wrap')!.getBoundingClientRect().height,
  }));
}

// An iPhone 13 upright in Safari with its bars. With 8 players the page was 717 px tall and End turn 39 px off screen.
for (const players of [8, 2]) {
  test(`on an upright iPhone (390×664) with ${players} players nothing scrolls and End turn is on screen`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone layout');
    const l = await fit(page, { width: 390, height: 664 }, players, 202);
    expect(l.scrollH).toBeLessThanOrEqual(l.vh);
    expect(l.endBottom).toBeLessThanOrEqual(l.vh);
    expect(l.board).toBeGreaterThanOrEqual(240);
    await page.screenshot({ path: `playtest/screens/phone-fit-390x664-${players}.png` });
  });
}

test('a phone with room keeps the board it had (Pixel 7, 412×839, 8 players)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout');
  const l = await fit(page, { width: 412, height: 839 }, 8, 101);
  expect(l.board).toBeCloseTo(442, 0);
  expect(l.scrollH).toBeLessThanOrEqual(l.vh);
});

// A home-screen install runs full screen (viewport-fit=cover), so an iPhone 13's notch and home indicator sit over
// the page. Chromium stands in for them over CDP.
test('on a home-screen install the title menu and End turn keep clear of the home indicator', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?sound=off');
  const menuBottom = await page.locator('.title-form').evaluate((e) => e.getBoundingClientRect().bottom);
  expect(menuBottom).toBeLessThanOrEqual(844 - 34);
  const l = await fit(page, { width: 390, height: 844 }, 8, 202);
  expect(l.scrollH).toBeLessThanOrEqual(l.vh);
  expect(l.endBottom).toBeLessThanOrEqual(l.vh - 34);
  expect(await page.getByTestId('roll').evaluate((e) => e.getBoundingClientRect().top)).toBeGreaterThanOrEqual(47);
  await page.screenshot({ path: 'playtest/screens/phone-fit-home-screen.png' });
});

// 320×568 with 8 players: the narrow chips stack their emblem over the numbers and the player bar is 367 px tall, so
// even a 240 px board doesn't fit. The page scrolls instead, and End turn keeps its padding below it.
test('on a 4-inch phone the board keeps 240 px and the page scrolls to End turn', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout');
  const l = await fit(page, { width: 320, height: 568 }, 8, 202);
  expect(l.board).toBeCloseTo(240, 0);
  expect(l.scrollH).toBeGreaterThan(l.vh);
  expect(l.scrollH - l.endBottom).toBeCloseTo(14, 0);
});

test('at 375 px the game bar keeps round, speed, help, sound, music and Quit on one row', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/?seed=42&players=4&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  // The widest it gets: a two-digit round at Instant.
  await page.getByTestId('round').evaluate((e) => (e.textContent = 'Round 99'));
  const ids = ['round', 'speed', 'help', 'sound', 'music', 'quit'];
  const boxes = await Promise.all(ids.map(async (id) => (await page.getByTestId(id).boundingBox())!));
  const quit = boxes.at(-1)!;
  expect(quit.y).toBeLessThan(boxes[0]!.y + boxes[0]!.height);
  expect(quit.x + quit.width).toBeLessThanOrEqual(375);
  expect(await page.getByTestId('speed').evaluate((e: HTMLSelectElement) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});
