import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

for (const variant of ['cluster', 'stack', 'banners'] as const) {
  test(`painted board, units=${variant}`, async ({ page }, info) => {
    await page.goto(`/?seed=4242&players=8&speed=instant&units=${variant}`);
    await page.waitForFunction(() => !!window.__hexdice?.state());
    await page.evaluate(() => window.__hexdice!.idle());
    await expect(page.locator('[data-territory]').first()).toBeVisible();
    await page.screenshot({ path: `playtest/screens/proto-${info.project.name}-${variant}.png` });

    const buildMs = await page.getByTestId('board').getAttribute('data-build-ms');
    console.log(`build ${info.project.name} ${variant}: ${buildMs} ms`);

    const id = await page.evaluate(() => {
      const s = window.__hexdice!.state()!;
      return s.territories.find((t) => t.owner === s.current && t.dice >= 2)?.id;
    });
    expect(id).toBeDefined();
    await page.getByTestId(`token-${id}`).click();
    await expect(page.locator(`[data-territory="${id}"]`)).toHaveClass(/is-selected/);
    await page.screenshot({ path: `playtest/screens/proto-${info.project.name}-${variant}-selected.png` });
  });
}
