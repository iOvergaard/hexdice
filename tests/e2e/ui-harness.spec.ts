import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const shot = (page: Page, project: string, name: string) =>
  page.screenshot({ path: `playtest/screens/ui-${project}-${name}.png`, fullPage: true });

test('renders 30 territories', async ({ page }) => {
  await page.goto('/harness.html?seed=7&players=4');
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.locator('[data-territory]')).toHaveCount(30);
});

test('tapping an own 2+ territory selects it', async ({ page }) => {
  await page.goto('/harness.html?seed=7&players=4');
  const id = await page.evaluate(() => {
    const g = [...document.querySelectorAll<SVGElement>('[data-territory]')].find(
      (el) => el.dataset.owner === '0' && Number(el.dataset.dice) >= 2,
    );
    return g?.dataset.territory;
  });
  expect(id).toBeDefined();
  await page.getByTestId(`token-${id}`).click();
  await expect(page.locator(`[data-territory="${id}"]`)).toHaveClass(/is-selected/);
  await page.getByTestId(`token-${id}`).click();
  await expect(page.locator('.is-selected')).toHaveCount(0);
});

test('attacker is on the right', async ({ page }) => {
  await page.goto('/harness.html?seed=7&players=4&roll=1');
  const att = await page.getByTestId('roll-attacker').boundingBox();
  const def = await page.getByTestId('roll-defender').boundingBox();
  expect(att!.x).toBeGreaterThan(def!.x);
  await expect(page.getByTestId('roll-attacker-sum')).toHaveText('16');
  await expect(page.getByTestId('roll-defender-sum')).toHaveText('12');
  await expect(page.getByTestId('roll-attacker')).toHaveClass(/is-winner/);
});

test('no horizontal scroll', async ({ page }) => {
  await page.goto('/harness.html?seed=7&players=8&roll=1');
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
  for (const id of ['roll', 'board', 'end-turn', 'player-0', 'player-7']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

test('an 8 vs 8 roll shows 8 cube dice a side on one row', async ({ page }) => {
  await page.goto('/harness.html?seed=7&players=8&roll=1&dice=8x8');
  await expect(page.getByTestId('roll-attacker-sum')).toHaveText('32');
  for (const role of ['attacker', 'defender']) {
    const side = page.getByTestId(`roll-${role}`);
    const dice = side.locator('.die');
    await expect(dice).toHaveCount(8);
    for (const die of await dice.all()) {
      const value = await die.getAttribute('data-value');
      expect(value).toMatch(/^[1-6]$/);
      await expect(die).toHaveAttribute('aria-label', value!);
      await expect(die.locator('.u-face, .u-side, .u-top')).toHaveCount(3);
    }
    const row = (await side.locator('.roll-dice').boundingBox())!;
    const first = (await dice.first().boundingBox())!;
    const last = (await dice.last().boundingBox())!;
    expect(first.x).toBeGreaterThanOrEqual(row.x - 0.5);
    expect(last.x + last.width).toBeLessThanOrEqual(row.x + row.width + 0.5);
    expect(Math.abs(last.y - first.y)).toBeLessThan(1);
  }
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

test('an 8 vs 8 roll stays inside the strip from 320 to 1024 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewport sizes');
  for (const width of [320, 360, 375, 641, 720, 768, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/harness.html?seed=7&players=8&roll=1&dice=8x8');
    await expect(page.getByTestId('roll-attacker-sum')).toHaveText('32');
    const out = await page.evaluate(() => {
      let worst = 0;
      const within = (inner: DOMRect, outer: DOMRect) => {
        worst = Math.max(worst, outer.left - inner.left, inner.right - outer.right, outer.top - inner.top, inner.bottom - outer.bottom);
      };
      const roll = document.querySelector('.roll')!.getBoundingClientRect();
      for (const side of document.querySelectorAll('.roll-side')) {
        const box = side.getBoundingClientRect();
        within(box, roll);
        for (const part of side.querySelectorAll('.roll-who, .roll-dice, .roll-sum, .roll-cost')) within(part.getBoundingClientRect(), box);
        const row = side.querySelector('.roll-dice')!.getBoundingClientRect();
        for (const die of side.querySelectorAll('.die')) within(die.getBoundingClientRect(), row);
      }
      return worst;
    });
    expect(out, `${width} px`).toBeLessThanOrEqual(0.5);
  }
});

test('rolling dice tumble, and keep still with reduced motion', async ({ page }) => {
  // Find and read the die in one step: the tumble repaints the dice every 80 ms, and a die read after a repaint is detached.
  const tumble = async () => {
    await page.locator('.is-rolling .die').first().waitFor();
    return page.evaluate(() => getComputedStyle(document.querySelector('.is-rolling .die')!).animationName);
  };
  await page.goto('/harness.html?seed=7&players=8&roll=1&tumble=1');
  expect(await tumble()).toBe('tumble');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/harness.html?seed=7&players=8&roll=1&tumble=1');
  expect(await tumble()).toBe('none');
});

test('title screen asks for 1–7 computer opponents', async ({ page }) => {
  await page.goto('/harness.html?title=1&players=5');
  await expect(page.getByRole('heading', { name: 'Computer opponents' })).toBeVisible();
  for (let n = 1; n <= 7; n++) await expect(page.getByTestId(`opponents-${n}`)).toHaveText(String(n));
  await expect(page.getByTestId('opponents-4')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('opponents-2').click();
  await expect(page.getByTestId('opponents-2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('opponents-4')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('ai-normal')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('start')).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

test('game-over overlay has its buttons', async ({ page }) => {
  await page.goto('/harness.html?seed=7&players=4&overlay=1');
  await expect(page.getByTestId('overlay-heading')).toHaveText('You were eliminated');
  for (const id of ['overlay-title', 'overlay-replay', 'overlay-watch']) await expect(page.getByTestId(id)).toBeVisible();
});

test('board preview prompt replaces the player bar', async ({ page }) => {
  await page.goto('/harness.html?seed=7&players=4&preview=1');
  await expect(page.getByTestId('preview-seed')).toHaveText('Seed 7');
  await expect(page.getByTestId('player-0')).toBeHidden();
  await page.getByTestId('preview-yes').click();
  await expect(page.getByTestId('preview')).toBeHidden();
  await expect(page.getByTestId('player-0')).toBeVisible();
});

test('saves screenshots', async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await page.goto('/harness.html?seed=7&players=8');
  await shot(page, p, 'board');
  const id = await page.evaluate(
    () =>
      [...document.querySelectorAll<SVGElement>('[data-territory]')].find((el) => el.dataset.owner === '0' && Number(el.dataset.dice) >= 3)
        ?.dataset.territory,
  );
  await page.getByTestId(`token-${id}`).click();
  await shot(page, p, 'selected');
  await page.goto('/harness.html?seed=7&players=8&roll=1');
  await shot(page, p, 'roll');
  await page.goto('/harness.html?seed=7&players=8&overlay=1');
  await shot(page, p, 'overlay');
  await page.goto('/harness.html?title=1&players=8');
  await shot(page, p, 'title');
  await page.goto('/harness.html?seed=7&players=8&preview=1');
  await shot(page, p, 'preview');
});
