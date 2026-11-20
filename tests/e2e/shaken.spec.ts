import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import { winProbability } from '../../src/engine/odds';
import { applyAction } from '../../src/engine/rules';
import type { GameState } from '../../src/engine/types';
import { formatOdds } from '../../src/ui/odds-badge';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

/** First random state at which `from` attacking `to` rolls a tie. */
function tieAt(s: GameState, from: number, to: number): number {
  for (let r = 1; r < 20_000; r++) {
    const e = applyAction({ ...s, rngState: r }, { type: 'attack', from, to }).events.find((x) => x.type === 'attackRolled');
    if (e?.type === 'attackRolled' && e.attackSum === e.defendSum) return r;
  }
  throw new Error(`no tie for ${from} on ${to}`);
}

const state = (page: import('@playwright/test').Page) => page.evaluate(() => structuredClone(window.__hexdice!.state()!));

test('a defender that holds is shaken: the attacking stack is spent, and a tie against it goes to you', async ({ page }, info) => {
  await page.goto('/?seed=42&players=4&speed=slow&sound=off&shaken=on');
  await page.waitForFunction(() => !!window.__hexdice);
  await page.evaluate(() => window.__hexdice!.idle());
  // Two of your stacks, 6 and 4 dice, border an AI territory holding 4.
  const s = await state(page);
  const me = s.players.find((p) => p.kind === 'human')!.id;
  expect(s.current).toBe(me);
  const t = s.territories.find((x) => x.owner !== me && x.neighbours.filter((n) => s.territories[n]!.owner === me).length >= 2)!;
  const [a, b] = t.neighbours.filter((n) => s.territories[n]!.owner === me) as [number, number];
  s.territories[a]!.dice = 6;
  s.territories[b]!.dice = 4;
  t.dice = 4;
  s.rngState = tieAt(s, a, t.id);
  await page.evaluate((x) => window.__hexdice!.load(x), s);

  await page.getByTestId(`token-${a}`).click();
  await page.getByTestId(`token-${t.id}`).click();
  await expect(page.getByTestId(`shaken-${t.id}`)).toHaveText('Shaken!', { timeout: 5_000 });
  await expect(page.getByTestId('roll-defender-cost')).toHaveText('shaken');
  await expect(page.getByTestId('roll-attacker-cost')).toHaveText('6 → 4 · spent');
  await expect(page.getByTestId(`token-${t.id}`)).toHaveClass(/is-shaken/);
  await expect(page.getByTestId(`token-${a}`)).toHaveClass(/is-spent/);
  await page.screenshot({ path: `playtest/screens/shaken-${info.project.name}.png` });

  // The spent stack can't be picked; from the other one, the badge counts the tie for you.
  await page.getByTestId(`token-${a}`).click();
  await expect(page.locator('.token.is-selected')).toHaveCount(0);
  await page.getByTestId(`token-${b}`).click();
  await expect(page.getByTestId(`odds-${t.id}`)).toHaveText(formatOdds(winProbability(4, 4, true)).text);
  await page.screenshot({ path: `playtest/screens/shaken-odds-${info.project.name}.png` });

  // A tie against the shaken territory captures it.
  const now = await state(page);
  now.rngState = tieAt(now, b, t.id);
  await page.evaluate((x) => window.__hexdice!.load(x), now);
  await page.getByTestId(`token-${b}`).click();
  await page.getByTestId(`token-${t.id}`).click();
  await expect(page.getByTestId('roll')).toContainText('Tie · captured', { timeout: 5_000 });
  await expect.poll(async () => (await state(page)).territories[t.id]!.owner).toBe(me);
  await expect(page.getByTestId(`token-${t.id}`)).not.toHaveClass(/is-shaken/);

  // Ending the turn clears both.
  await page.evaluate(() => window.__hexdice!.endTurn());
  await expect(page.locator('.token.is-spent, .token.is-shaken')).toHaveCount(0);
});
