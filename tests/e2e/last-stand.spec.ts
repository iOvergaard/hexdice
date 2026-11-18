import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import type { GameState } from '../../src/engine/types';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

test('ending the turn that leaves two players gives the smaller one a last stand', async ({ page }, info) => {
  await page.goto('/?seed=42&players=4&speed=slow&sound=off');
  await page.waitForFunction(() => !!window.__hexdice);
  await page.evaluate(() => window.__hexdice!.idle());
  // You hold everything but three territories of one AI; the other two AIs are out.
  const theirs = await page.evaluate(() => {
    const s: GameState = structuredClone(window.__hexdice!.state()!);
    const human = s.players.find((p) => p.kind === 'human')!.id;
    const ai = s.players.find((p) => p.kind === 'ai')!.id;
    const ids = [0, 1, 2];
    s.territories.forEach((t) => {
      t.owner = ids.includes(t.id) ? ai : human;
      t.dice = ids.includes(t.id) ? 2 : 3;
    });
    s.players.forEach((p) => (p.alive = p.id === human || p.id === ai));
    s.current = human;
    window.__hexdice!.load(s);
    return ids;
  });

  await page.getByTestId('end-turn').click();
  const label = page.locator('[data-testid^="stand-"]');
  await expect(label).toBeVisible({ timeout: 5_000 });
  await expect(label).toHaveText('Last stand!');
  await expect(page.getByTestId('roll-message')).toContainText('Last stand');
  await page.screenshot({ path: `playtest/screens/last-stand-${info.project.name}.png` });

  const dice = await page.evaluate((ids) => ids.map((id) => window.__hexdice!.state()!.territories[id]!.dice), theirs);
  expect(dice).toEqual([3, 3, 3]);
  expect(await page.evaluate(() => window.__hexdice!.events().filter((e) => e.type === 'lastStand').length)).toBe(1);
});
