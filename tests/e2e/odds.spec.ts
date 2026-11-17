import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { winProbability } from '../../src/engine/odds';
import { formatOdds } from '../../src/ui/odds-badge';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `playtest/screens/odds-${info.project.name}-${name}.png` });

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
}

test('win-chance badges on targets', async ({ page }, info) => {
  await page.goto('/?seed=42&players=4&speed=instant');
  await ready(page);
  const pick = await page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    let best: { from: number; dice: number; targets: { id: number; dice: number }[] } | null = null;
    for (const t of s.territories) {
      if (t.owner !== s.current || t.dice < 2) continue;
      const targets = t.neighbours.filter((n) => s.territories[n]!.owner !== s.current).map((n) => ({ id: n, dice: s.territories[n]!.dice }));
      if (targets.length && (!best || targets.length > best.targets.length)) best = { from: t.id, dice: t.dice, targets };
    }
    if (!best) throw new Error('no legal attack');
    return best;
  });

  await expect(page.locator('[data-testid^="odds-"]')).toHaveCount(0);
  await page.getByTestId(`token-${pick.from}`).click();
  await expect(page.locator('[data-testid^="odds-"]')).toHaveCount(pick.targets.length);
  for (const t of pick.targets) {
    await expect(page.getByTestId(`odds-${t.id}`)).toHaveText(formatOdds(winProbability(pick.dice, t.dice)).text);
  }
  await shot(page, info, 'selected');

  await page.getByTestId(`token-${pick.from}`).click();
  await expect(page.locator('[data-testid^="odds-"]')).toHaveCount(0);
});
