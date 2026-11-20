import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import type { GameState } from '../../src/engine/types';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

test('a fresh capture stays selected, so the next tap attacks on from it', async ({ page }, info) => {
  await page.goto('/?seed=42&players=3&speed=fast&sound=off');
  await page.waitForFunction(() => !!window.__hexdice);
  await page.evaluate(() => window.__hexdice!.idle());
  // You hold one stack of 8 next to a 1-die AI territory, which borders another 1-die one: both captures are certain.
  const { a, b, c } = await page.evaluate(() => {
    const s: GameState = structuredClone(window.__hexdice!.state()!);
    const human = s.players.find((p) => p.kind === 'human')!.id;
    const ai = s.players.find((p) => p.kind === 'ai')!.id;
    let pick: { a: number; b: number; c: number } | null = null;
    for (const t of s.territories) {
      for (const b of t.neighbours) {
        const c = s.territories[b]!.neighbours.find(
          (x) => x !== t.id && s.territories[x]!.neighbours.some((y) => y !== t.id && y !== b),
        );
        if (c !== undefined) pick = { a: t.id, b, c };
        if (pick) break;
      }
      if (pick) break;
    }
    const { a, b, c } = pick!;
    s.territories.forEach((x) => {
      x.owner = ai;
      x.dice = 2;
    });
    s.territories[a]!.owner = human;
    s.territories[a]!.dice = 8;
    s.territories[b]!.dice = 1;
    s.territories[c]!.dice = 1;
    s.players.forEach((p) => (p.alive = s.territories.some((x) => x.owner === p.id)));
    s.current = human;
    window.__hexdice!.load(s);
    return pick!;
  });
  const territory = (id: number) => page.locator(`[data-territory="${id}"]`);

  await page.getByTestId(`token-${a}`).click();
  await page.getByTestId(`token-${b}`).click();
  await page.evaluate(() => window.__hexdice!.idle());
  await expect(territory(b)).toHaveClass(/is-selected/);
  await expect(page.getByTestId(`odds-${c}`)).toBeVisible();
  await page.screenshot({ path: `playtest/screens/keep-capture-${info.project.name}.png` });

  // One tap carries on from the capture.
  await page.getByTestId(`token-${c}`).click();
  await page.evaluate(() => window.__hexdice!.idle());
  const actions = await page.evaluate(() => window.__hexdice!.actions());
  expect(actions).toEqual([
    { type: 'attack', from: a, to: b },
    { type: 'attack', from: b, to: c },
  ]);
  await expect(territory(c)).toHaveClass(/is-selected/);

  // Tapping it again lets go.
  await page.getByTestId(`token-${c}`).click();
  await expect(page.locator('[data-territory].is-selected')).toHaveCount(0);
});
