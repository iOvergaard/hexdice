import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

test('each player shows their total dice next to their income, and the bar still fits', async ({ page }, info) => {
  await page.goto('/?seed=42&players=8&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  const totals = await page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    return s.players.map((p) => s.territories.filter((t) => t.owner === p.id).reduce((n, t) => n + t.dice, 0));
  });
  for (const [id, total] of totals.entries()) {
    const dice = page.getByTestId(`player-${id}`).locator('.chip-dice');
    await expect(dice).toHaveText(String(total));
    await expect(page.getByTestId(`player-${id}`)).toHaveAttribute('aria-label', new RegExp(`, ${total} dice`));
  }
  // Nothing in a chip spills over its edge.
  const spill = await page.evaluate(() =>
    [...document.querySelectorAll('.chip')].some((chip) => {
      const box = chip.getBoundingClientRect();
      return [...chip.children].some((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && getComputedStyle(c).position !== 'absolute' && (r.right > box.right + 0.5 || r.left < box.left - 0.5);
      });
    }),
  );
  expect(spill).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `playtest/screens/player-bar-${info.project.name}.png` });
});
