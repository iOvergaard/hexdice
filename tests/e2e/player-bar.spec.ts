import { expect, test, type Page } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import type { GameState } from '../../src/engine/types';

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

/**
 * Late in a game: the first computer player holds all but one territory per other player, 8 dice on each (a
 * three-digit dice count), and everyone is still in. With `extras`, it also has a reserve of 12 and a knockout
 * bonus of 2, and you a bonus of 1.
 */
async function lateGame(page: Page, players: number, extras: boolean): Promise<void> {
  // A saved game would stop the link at the title.
  if (page.url().startsWith('http')) await page.evaluate(() => localStorage.clear());
  await page.goto(`/?seed=101&players=${players}&speed=instant&sound=off`);
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  await page.evaluate((extras) => {
    const s: GameState = structuredClone(window.__hexdice!.state()!);
    const human = s.players.find((p) => p.kind === 'human')!.id;
    const big = s.players.find((p) => p.kind === 'ai')!.id;
    const others = s.players.filter((p) => p.id !== big).map((p) => p.id);
    s.territories.forEach((t, i) => {
      t.owner = i < others.length ? others[i]! : big;
      t.dice = i < others.length ? 3 : 8;
    });
    s.players.forEach((p) => {
      p.alive = true;
      p.reserve = extras && p.id === big ? 12 : 0;
      p.knockouts = !extras ? 0 : p.id === big ? 2 : p.id === human ? 1 : 0;
    });
    s.current = human;
    s.winner = null;
    window.__hexdice!.load(s);
  }, extras);
  await page.evaluate(() => window.__hexdice!.idle());
}

/**
 * How each chip lays out: its name (hidden, in line, or You's tag above the chip), whether its reserve or knockout
 * bonus runs past its edges, and whether the bonus sits under the numbers.
 */
async function chipLayout(page: Page) {
  return page.evaluate(() => {
    const range = document.createRange();
    return [...document.querySelectorAll<HTMLElement>('.chip')].map((chip) => {
      const box = chip.getBoundingClientRect();
      const name = chip.querySelector<HTMLElement>('.chip-name')!;
      const style = getComputedStyle(name);
      const shown = style.display !== 'none';
      // The text itself, not its box: text can run out of a box that fits.
      const out = [...chip.querySelectorAll<HTMLElement>('.chip-reserve, .chip-bonus')]
        .filter((e) => {
          range.selectNodeContents(e);
          const r = range.getBoundingClientRect();
          return r.right > box.right + 0.5 || r.left < box.left - 0.5;
        })
        .map((e) => e.className);
      const bonus = chip.querySelector('.chip-bonus');
      return {
        player: chip.dataset.testid!,
        you: chip.classList.contains('is-you'),
        name: !shown ? 'hidden' : style.position === 'absolute' ? 'tag' : 'inline',
        cut: shown && name.scrollWidth > name.clientWidth,
        tagAbove: name.getBoundingClientRect().top < box.top,
        out,
        bonusUnderNumbers: !bonus || bonus.getBoundingClientRect().top >= chip.querySelector('.chip-stats')!.getBoundingClientRect().bottom - 0.5,
      };
    });
  });
}

// Chips with room for the longest name next to three-digit dice, and chips without.
const BAR_SIZES: { players: number; width: number; height?: number; names: boolean }[] = [
  { players: 2, width: 375, names: false },
  { players: 2, width: 1920, names: true },
  { players: 4, width: 700, names: true },
  { players: 5, width: 1024, names: true },
  { players: 8, width: 1024, names: false },
  { players: 8, width: 1280, names: false },
  { players: 8, width: 750, height: 342, names: false },
];

test('player names in the bar show whole where they fit, and only You shows, as a tag, where they do not', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport sizes');
  for (const { players, width, height, names } of BAR_SIZES) {
    await page.setViewportSize({ width, height: height ?? 900 });
    await lateGame(page, players, false);
    for (const chip of await chipLayout(page)) {
      const where = `${players} players at ${width} px, ${chip.player}`;
      expect(chip.cut, where).toBe(false);
      if (names) expect(chip.name, where).toBe('inline');
      else if (chip.you) expect([chip.name, chip.tagAbove], where).toEqual(['tag', true]);
      else expect(chip.name, where).toBe('hidden');
    }
  }
});

test('the reserve and the knockout bonus stay inside the chip, the bonus on a line of its own, and no name is cut', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport sizes');
  for (const { players, width, height, names } of BAR_SIZES) {
    await page.setViewportSize({ width, height: height ?? 900 });
    await lateGame(page, players, true);
    await expect(page.locator('.chip-bonus')).toHaveCount(2);
    for (const chip of await chipLayout(page)) {
      const where = `${players} players at ${width} px, ${chip.player}`;
      expect(chip.cut, where).toBe(false);
      expect(chip.name, where).toBe(names ? 'inline' : chip.you ? 'tag' : 'hidden');
      expect(chip.bonusUnderNumbers, where).toBe(true);
      expect(chip.out, where).toEqual([]);
    }
  }
});
