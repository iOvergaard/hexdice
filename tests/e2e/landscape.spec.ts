import { expect, test, type Page } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

/** What the game screen looks like at this size: the boxes that matter, and whether the page scrolls. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const controls = [...document.querySelectorAll('.hud .controls button, .hud .controls select')].map((e) => e.getBoundingClientRect());
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      board: box('.board-wrap'),
      roll: box('[data-testid=roll]'),
      end: box('[data-testid=end-turn]'),
      controlsRight: Math.max(...controls.map((r) => r.right)),
    };
  });
}

// iPhone 13 in Safari with its bars, and a 4-inch phone: both on their side.
for (const size of [
  { width: 750, height: 342 },
  { width: 568, height: 320 },
]) {
  test(`on a phone on its side (${size.width}×${size.height}) the map takes the full height beside the bar`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone layout');
    await page.setViewportSize(size);
    await page.goto('/?seed=42&players=8&speed=instant&sound=off');
    await page.waitForFunction(() => !!window.__hexdice?.state());
    await page.evaluate(() => window.__hexdice!.idle());
    const l = await layout(page);
    // Stacked, the board was 25 px tall at 750×342 with 8 players.
    expect(l.board.height).toBeGreaterThan(l.vh * 0.85);
    expect(l.board.right).toBeLessThanOrEqual(l.roll.left);
    // Nothing scrolls, and End turn and every control sit wholly on screen.
    expect(l.scrollH).toBeLessThanOrEqual(l.vh);
    expect(l.scrollW).toBeLessThanOrEqual(l.vw);
    expect(l.end.bottom).toBeLessThanOrEqual(l.vh);
    expect(l.controlsRight).toBeLessThanOrEqual(l.vw);
    await page.screenshot({ path: `playtest/screens/landscape-${size.width}x${size.height}.png` });
  });
}

test('on a phone on its side you can tap to attack, and the roll strip keeps its words whole', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout');
  await page.setViewportSize({ width: 750, height: 342 });
  await page.goto('/?seed=42&players=4&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  const pick = await page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    for (const t of s.territories) {
      if (t.owner !== s.current || t.dice < 2) continue;
      const to = t.neighbours.find((n) => s.territories[n]!.owner !== s.current);
      if (to !== undefined) return { from: t.id, to };
    }
    return null;
  });
  expect(pick).not.toBeNull();
  // Tap the dice tokens, as a person would.
  await page.locator(`[data-token-for="${pick!.from}"]`).tap();
  await page.locator(`[data-token-for="${pick!.to}"]`).tap();
  await expect.poll(() => page.evaluate(() => window.__hexdice!.actions().length)).toBe(1);
  await expect(page.getByTestId('roll-attacker-cost')).not.toBeEmpty();
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll('.roll-cost, .roll-sum, .roll-name')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
  );
  expect(cut).toEqual([]);
});
