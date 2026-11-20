import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

test('each player shows their total dice and territories under their income, and the bar still fits', async ({ page }, info) => {
  await page.goto('/?seed=42&players=8&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  const totals = await page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    return s.players.map((p) => {
      const mine = s.territories.filter((t) => t.owner === p.id);
      return { dice: mine.reduce((n, t) => n + t.dice, 0), held: mine.length };
    });
  });
  for (const [id, { dice, held }] of totals.entries()) {
    const chip = page.getByTestId(`player-${id}`);
    await expect(chip.locator('.chip-dice')).toHaveText(String(dice));
    await expect(chip.locator('.chip-held')).toHaveText(String(held));
    await expect(chip).toHaveAttribute('aria-label', new RegExp(`, ${dice} dice, ${held} territor(y|ies)`));
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
