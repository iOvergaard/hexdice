import { expect, test, type Page } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import type { AiLevel, GameState } from '../../src/engine/types';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

/**
 * Eight players, all in, your turn. You hold `you` territories, the first computer player `rival`, and the rest
 * share what's left. Returns the territory count per player id.
 */
async function deal(page: Page, you: number, rival: number, level: AiLevel = 'normal'): Promise<{ human: number; ai: number; held: number[] }> {
  return page.evaluate(
    ({ you, rival, level }) => {
      const s: GameState = structuredClone(window.__hexdice!.state()!);
      const human = s.players.find((p) => p.kind === 'human')!.id;
      const ai = s.players.find((p) => p.kind === 'ai')!.id;
      const others = s.players.filter((p) => p.id !== human && p.id !== ai).map((p) => p.id);
      s.territories.forEach((t, i) => {
        t.owner = i < you ? human : i < you + rival ? ai : others[(i - you - rival) % others.length]!;
        t.dice = 2;
      });
      s.players.forEach((p) => {
        p.alive = true;
        p.reserve = 0;
        if (p.kind === 'ai') p.aiLevel = level;
      });
      s.current = human;
      s.winner = null;
      window.__hexdice!.load(s);
      return { human, ai, held: s.players.map((p) => s.territories.filter((t) => t.owner === p.id).length) };
    },
    { you, rival, level },
  );
}

test('the player bar counts territories and marks the runaways the computer players gang up on', async ({ page }, info) => {
  // The phone project checks the narrowest phone the game supports.
  if (info.project.name === 'phone') await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?seed=42&players=8&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());

  // Eight players in: 8 territories make a runaway. You hold 8, the rival 7.
  const { human, ai, held } = await deal(page, 8, 7);
  for (const [id, n] of held.entries()) {
    await expect(page.getByTestId(`player-${id}`).locator('.chip-held')).toHaveText(String(n));
    await expect(page.getByTestId(`player-${id}`)).toHaveAttribute('aria-label', new RegExp(`, ${n} territor(y|ies)`));
  }
  await expect(page.getByTestId(`player-${human}-runaway`)).toBeVisible();
  await expect(page.getByTestId(`player-${human}`)).toHaveAttribute('aria-label', /runaway: the computer players are ganging up on you/);
  await expect(page.getByTestId(`player-${ai}-runaway`)).toHaveCount(0);
  await expect(page.locator('.chip-runaway')).toHaveCount(1);

  // One more territory makes the rival a runaway too.
  await deal(page, 8, 8);
  await expect(page.getByTestId(`player-${ai}-runaway`)).toBeVisible();
  await expect(page.getByTestId(`player-${ai}`)).toHaveAttribute('aria-label', /runaway: the computer players are ganging up on them/);
  await expect(page.locator('.chip-runaway')).toHaveCount(2);

  // The mark clears the numbers and the You tag, nothing spills out of a chip, and the page doesn't scroll sideways.
  const clash = await page.evaluate(() => {
    const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return [...document.querySelectorAll('.chip-runaway')].some((mark) => {
      const chip = mark.closest('.chip')!;
      const box = mark.getBoundingClientRect();
      return [...chip.querySelectorAll('.chip-name, .chip-group, .chip-dice, .chip-held')].some(
        (e) => getComputedStyle(e).display !== 'none' && overlap(box, e.getBoundingClientRect()),
      );
    });
  });
  expect(clash).toBe(false);
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
  await page.locator('.hud').screenshot({ path: `playtest/screens/runaway-mark-${info.project.name}.png` });

  // Easy doesn't gang up, so a table of Easy computer players marks nobody.
  await deal(page, 8, 8, 'easy');
  await expect(page.getByTestId(`player-${human}`).locator('.chip-held')).toHaveText('8');
  await expect(page.locator('.chip-runaway')).toHaveCount(0);
});
