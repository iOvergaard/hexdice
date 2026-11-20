import { expect, test, type Page } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import type { GameState } from '../../src/engine/types';

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

const position = (page: Page) =>
  page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    return { seed: s.config.seed, territories: s.territories.map((t) => [t.owner, t.dice]), current: s.current, round: s.round };
  });

/** Starts the seed-77 game from its link and plays one turn, so there's a game in progress. */
async function gameInProgress(page: Page) {
  await page.goto('/?seed=77&players=4&ai=easy&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(async () => {
    await window.__hexdice!.idle();
    await window.__hexdice!.endTurn();
    await window.__hexdice!.idle();
  });
  return position(page);
}

async function continueGame(page: Page) {
  await page.getByTestId('continue').click();
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
}

test('Quit keeps your game: the title offers Continue, which picks up where you left off', async ({ page }, info) => {
  const before = await gameInProgress(page);
  expect(before.round).toBe(2);
  await page.getByTestId('quit').click();
  await expect(page.getByTestId('title')).toBeVisible();
  await page.screenshot({ path: `playtest/screens/keep-save-${info.project.name}-quit.png` });
  await continueGame(page);
  expect(await position(page)).toEqual(before);
});

test('Quit from a game you are out of leaves nothing to continue', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=slow&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  // The link saved the game at its start; now the human holds nothing and the AIs play on.
  await page.evaluate(() => {
    const s: GameState = structuredClone(window.__hexdice!.state()!);
    const ais = s.players.filter((p) => p.kind === 'ai').map((p) => p.id);
    s.territories.forEach((t, i) => (t.owner = ais[i % ais.length]!));
    s.players.forEach((p) => (p.alive = p.kind === 'ai'));
    s.current = ais[0]!;
    window.__hexdice!.load(s);
  });
  await page.getByTestId('quit').click();
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveCount(0);
});

test('a link opened mid-game offers your game and the linked one, and replaces yours only when you pick the link', async ({ page }, info) => {
  const before = await gameInProgress(page);
  await page.goto('/?seed=42&players=4&speed=instant&sound=off');
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('play-link')).toBeVisible();
  await page.screenshot({ path: `playtest/screens/keep-save-${info.project.name}-link.png` });
  await continueGame(page);
  expect(await position(page)).toEqual(before);

  // Opened again, the link is one tap away, and playing it makes it the game you continue.
  await page.goto('/?seed=42&players=4&speed=instant&sound=off');
  await page.getByTestId('play-link').click();
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
  expect(await position(page)).toMatchObject({ seed: 42, round: 1 });
  await page.goto('/?sound=off');
  await expect(page.getByTestId('play-link')).toHaveCount(0);
  await continueGame(page);
  expect((await position(page)).seed).toBe(42);
});
