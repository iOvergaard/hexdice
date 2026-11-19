import { expect, test } from '@playwright/test';

test("what's new lists the player-facing changes and remembers you've read them", async ({ page }, info) => {
  await page.goto('/');
  const button = page.getByTestId('whats-new');
  await expect(button.locator('.whats-new-dot')).toBeVisible();

  await button.click();
  const dialog = page.getByTestId('whats-new-dialog');
  await expect(dialog.getByRole('heading', { name: "What's new" })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '18-11-2026' })).toBeVisible();
  await expect(dialog).toContainText('Last stand for the smaller of the last two players');
  // Each line links its commit, and the panel names the build you're playing.
  const hash = dialog.getByRole('link', { name: '7c440fb' });
  await expect(hash).toHaveAttribute('href', 'https://github.com/iOvergaard/hexdice/commit/7c440fb');
  await expect(dialog.getByTestId('build')).toHaveText(/^[0-9a-f]{7}$/);
  await expect(dialog).toContainText("You're playing build");
  // Docs, chores and prototypes stay out.
  await expect(dialog).not.toContainText('Sim results');
  await expect(dialog).not.toContainText('as a setting');
  await expect(dialog).toContainText('Hexdice went online on 17-11-2026.');

  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({ path: `playtest/screens/whats-new-${info.project.name}.png` });

  await page.getByTestId('whats-new-done').click();
  await expect(dialog).toHaveCount(0);
  await expect(button.locator('.whats-new-dot')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('whats-new')).toBeVisible();
  await expect(page.getByTestId('whats-new').locator('.whats-new-dot')).toHaveCount(0);
});
