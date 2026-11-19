import { expect, test, type Page, type TestInfo } from '@playwright/test';

const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `playtest/screens/title-${info.project.name}-${name}.png` });

test('the title shows a dealt board behind the menu, as scenery only', async ({ page }, info) => {
  await page.goto('/?sound=off');
  const scene = page.getByTestId('title-scene');
  await expect(scene.locator('.territory').first()).toBeAttached();
  await shot(page, info, 'scene');

  // None of the game's hooks: tests and taps can't mistake it for the board in play.
  await expect(page.getByTestId('board')).toHaveCount(0);
  await expect(page.locator('[data-territory],[data-token-for]')).toHaveCount(0);
  await expect(scene.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(await scene.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');

  // A tap on the board does nothing; Start still leads to the preview.
  const box = (await scene.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.2);
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('preview')).toBeVisible();
});

test('at 375 × 812 the title fits: Start on the first screen, the extras on one row, no sideways scroll', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?sound=off');
  await expect(page.getByTestId('title-scene').locator('.territory').first()).toBeAttached();
  await shot(page, info, '375');
  const start = (await page.getByTestId('start').boundingBox())!;
  expect(start.y + start.height).toBeLessThanOrEqual(812);
  const tops = await Promise.all(['how-to-play', 'whats-new'].map(async (id) => (await page.getByTestId(id).boundingBox())!.y));
  const sound = (await page.getByTestId('title').getByRole('button', { name: 'Sound' }).boundingBox())!.y;
  expect(new Set([...tops, sound].map(Math.round)).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
