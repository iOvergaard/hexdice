import { expect, test, type Page } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

/** The board's box in page coordinates, and whether the map is turned on its side. */
async function boardBox(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ left: number; top: number; width: number; height: number; rotated: boolean }>((resolve) =>
        // Two frames, so a change of size has been laid out and the board has turned to fit it.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const r = document.querySelector('.board-wrap')!.getBoundingClientRect();
            resolve({
              left: r.left + scrollX,
              top: r.top + scrollY,
              width: r.width,
              height: r.height,
              rotated: document.querySelector('[data-testid=board]')!.classList.contains('is-rotated'),
            });
          }),
        ),
      ),
  );
}

/** The test ids that Tab reaches in a few presses from the top of the page. */
async function tabStops(page: Page): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const ids = new Set<string>();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid);
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

// Issue #30: the preview hid the player bar, so the board's box was taller until Yes, and on an upright phone the
// map you said yes to turned on its side or shrank as the game began.
for (const size of [
  { project: 'phone', name: 'Pixel 7', viewport: { width: 412, height: 839 } },
  { project: 'phone', name: 'iPhone 13', viewport: { width: 390, height: 664 } },
  { project: 'desktop', name: 'desktop', viewport: { width: 1280, height: 800 } },
  { project: 'desktop', name: 'small desktop', viewport: { width: 1024, height: 768 } },
]) {
  for (const players of [2, 8]) {
    test(`the board keeps its box and its turn from the preview into the game: ${size.name}, ${players} players`, async ({ page }, info) => {
      test.skip(info.project.name !== size.project, `${size.project} layout`);
      await page.setViewportSize(size.viewport);
      await page.goto('/?sound=off&speed=instant');
      await page.getByTestId(`opponents-${players - 1}`).click();
      await page.getByTestId('start').click();
      await expect(page.getByTestId('preview')).toBeVisible();
      // The bar is there for this game, holding its space, but out of sight. Soft, so the box is compared regardless.
      await expect.soft(page.getByTestId(`player-${players - 1}`)).toBeAttached();
      await expect.soft(page.getByTestId(`player-${players - 1}`)).toBeHidden();
      const before = await boardBox(page);
      const file = `${size.viewport.width}x${size.viewport.height}-${players}p`;
      await page.screenshot({ path: `playtest/screens/preview-${file}-before-yes.png` });
      await page.getByTestId('preview-yes').click();
      await expect(page.getByTestId('preview')).toBeHidden();
      await expect(page.getByTestId(`player-${players - 1}`)).toBeVisible();
      await page.evaluate(() => window.__hexdice!.idle());
      expect(await boardBox(page)).toEqual(before);
      await page.screenshot({ path: `playtest/screens/preview-${file}-after-yes.png` });
    });
  }
}

test('during the preview only No and Yes take focus and Space does nothing; in the game they are gone', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Keyboard focus and shortcuts are a desktop feature');
  await page.goto('/?sound=off&speed=instant');
  await page.getByTestId('opponents-1').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('preview')).toBeVisible();
  await expect.soft(page.locator('.hud')).toHaveAttribute('inert', '');
  await expect.soft(page.getByRole('button', { name: 'End turn' })).toHaveCount(0);
  expect(await tabStops(page)).toEqual(['preview-no', 'preview-yes']);

  // No deals another map with the bar drawn for it, still out of reach.
  const seed = await page.getByTestId('preview-seed').textContent();
  await page.getByTestId('preview-no').click();
  await expect(page.getByTestId('preview-seed')).not.toHaveText(seed!);
  await expect.soft(page.getByTestId('player-1')).toBeAttached();
  await expect.soft(page.locator('.hud')).toHaveAttribute('inert', '');
  expect(await tabStops(page)).toEqual(['preview-no', 'preview-yes']);

  // Space ends your turn in the game, but not before you've said yes to the map. The seats are dealt at random,
  // so deal until you go first (half the deals with 2 players).
  const youFirst = () => page.evaluate(() => window.__hexdice!.state()!.players[window.__hexdice!.state()!.current]!.kind === 'human');
  for (let deals = 0; deals < 30 && !(await youFirst()); deals++) await page.getByTestId('preview-no').click();
  expect(await youFirst()).toBe(true);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__hexdice!.actions().length)).toBe(0);
  await expect(page.getByTestId('preview')).toBeVisible();

  await page.getByTestId('preview-yes').click();
  await page.evaluate(() => window.__hexdice!.idle());
  await expect(page.getByTestId('preview')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: 'Yes' })).toHaveCount(0);
  const stops = await tabStops(page);
  expect(stops).toContain('end-turn');
  expect(stops).not.toContain('preview-yes');
  expect(stops).not.toContain('preview-no');
});
