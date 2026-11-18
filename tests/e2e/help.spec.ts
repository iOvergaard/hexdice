import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

test('how to play opens from the title and closes with Got it or Escape', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('how-to-play').click();
  const dialog = page.getByTestId('help-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Linking up' })).toBeVisible();
  await expect(dialog).toContainText('a tie goes to the defender');

  // It fits the screen and the rules scroll inside it.
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({ path: `playtest/screens/help-${info.project.name}-title.png` });

  await page.getByTestId('help-done').click();
  await expect(dialog).toHaveCount(0);
  await page.getByTestId('how-to-play').click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('title')).toBeVisible();
});

test('in game, the ? button shows the rules being played, and Space does not end your turn behind it', async ({ page }, info) => {
  await page.goto('/?seed=42&players=4&speed=slow&sound=off&link=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  const before = await page.evaluate(() => window.__hexdice!.actions().length);

  await page.getByTestId('help').click();
  const dialog = page.getByTestId('help-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Reinforcements' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Linking up' })).toHaveCount(0);
  await page.screenshot({ path: `playtest/screens/help-${info.project.name}-game.png` });

  await dialog.locator('.help-body').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__hexdice!.actions().length)).toBe(before);

  // A tap outside the panel closes it.
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('end-turn')).toBeEnabled();
});
