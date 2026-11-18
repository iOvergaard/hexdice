import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import type { GameState } from '../../src/engine/types';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

test('a catch-up link shows its bonus on the linking territory', async ({ page }, info) => {
  await page.goto('/?seed=42&players=4&speed=slow&sound=off&link=catchup');
  await page.waitForFunction(() => !!window.__hexdice);
  await page.evaluate(() => window.__hexdice!.idle());
  // You hold only two separate territories (far below average) either side of an AI territory, and attack it with 6 dice.
  const { from, to } = await page.evaluate(() => {
    const s: GameState = structuredClone(window.__hexdice!.state()!);
    const human = s.players.find((p) => p.kind === 'human')!.id;
    const [ai1, ai2] = s.players.filter((p) => p.kind === 'ai').map((p) => p.id);
    let pick: { a: number; b: number; t: number } | null = null;
    for (const t of s.territories) {
      for (const a of t.neighbours) {
        const b = t.neighbours.find((x) => x !== a && !s.territories[a]!.neighbours.includes(x));
        if (b !== undefined) pick = { a, b, t: t.id };
      }
      if (pick) break;
    }
    const { a, b, t } = pick!;
    s.territories.forEach((x) => {
      x.owner = ai1!;
      x.dice = 2;
    });
    s.territories[a]!.owner = human;
    s.territories[a]!.dice = 6;
    s.territories[b]!.owner = human;
    s.territories[b]!.dice = 1;
    s.territories[t]!.owner = ai2!;
    s.territories[t]!.dice = 1;
    s.players.forEach((p) => (p.alive = s.territories.some((x) => x.owner === p.id)));
    s.current = human;
    window.__hexdice!.load(s);
    return { from: a, to: t };
  });
  await page.getByTestId(`token-${from}`).click();
  await page.getByTestId(`token-${to}`).click();
  const label = page.getByTestId(`link-${to}`);
  await expect(label).toBeVisible({ timeout: 5_000 });
  await expect(label).toHaveText('+2 linked!');
  await page.screenshot({ path: `playtest/screens/link-${info.project.name}.png` });
  expect(await page.evaluate((id) => window.__hexdice!.state()!.territories[id]!.dice, to)).toBe(7);
});
