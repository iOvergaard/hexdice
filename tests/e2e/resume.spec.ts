import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

test('reload mid-game, continue, and land on the same position', async ({ page }, info) => {
  // Random seed and AI turns at Normal speed: this ran 14–32 s on main, past the 30 s default.
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.getByTestId('continue')).toHaveCount(0);
  await page.getByTestId('players-4').click();
  await page.getByTestId('start').click();
  await page.getByTestId('preview-yes').click();
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  await page.evaluate(async () => {
    const h = window.__hexdice!;
    const s = h.state()!;
    for (const t of s.territories) {
      if (t.owner !== s.current || t.dice < 2) continue;
      const to = t.neighbours.find((n) => s.territories[n]!.owner !== s.current);
      if (to !== undefined) {
        await h.attack(t.id, to);
        break;
      }
    }
    await h.idle();
    await h.endTurn();
    await h.idle();
  });
  const snap = () =>
    page.evaluate(() => {
      const s = window.__hexdice!.state()!;
      return { territories: s.territories.map((t) => [t.owner, t.dice]), current: s.current, round: s.round };
    });
  const before = await snap();

  await page.reload();
  await expect(page.getByTestId('title')).toBeVisible();
  await page.screenshot({ path: `playtest/screens/resume-${info.project.name}-title.png` });
  await page.getByTestId('continue').click();
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  expect(await snap()).toEqual(before);
});

test('a finished game leaves nothing to continue', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=instant');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.autoplay(true));
  await expect(page.getByTestId('overlay')).toBeVisible({ timeout: 60_000 });
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveCount(0);
});

test('continuing plays out exactly like never reloading', async ({ page }) => {
  const snap = () =>
    page.evaluate(() => {
      const s = window.__hexdice!.state()!;
      return { territories: s.territories.map((t) => [t.owner, t.dice]), current: s.current, round: s.round };
    });
  const turn = () => page.evaluate(async () => {
    await window.__hexdice!.endTurn();
    await window.__hexdice!.idle();
  });
  const start = async () => {
    await page.goto('/?seed=77&players=4&ai=easy&speed=instant');
    await page.waitForFunction(() => !!window.__hexdice?.state());
    await page.evaluate(() => window.__hexdice!.idle());
  };

  // Easy AIs draw random numbers, so this also proves the AI's random state survives the reload.
  // Two turns straight through.
  await start();
  await turn();
  await turn();
  const straight = await snap();

  // One turn, reload, continue, then the second turn: the AIs must make the same moves.
  await page.evaluate(() => localStorage.clear());
  await start();
  await turn();
  await page.goto('/');
  await page.getByTestId('continue').click();
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  await turn();
  expect(await snap()).toEqual(straight);
});
