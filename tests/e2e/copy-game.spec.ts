import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { applyAction } from '../../src/engine/rules';
import { createGame } from '../../src/engine/setup';
import type { Action, GameConfig, GameState } from '../../src/engine/types';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `playtest/screens/copy-game-${info.project.name}-${name}.png` });

async function playToEnd(page: Page): Promise<void> {
  await page.goto('/?seed=42&players=4&ai=hard&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.autoplay(true));
  await expect(page.getByTestId('overlay')).toBeVisible({ timeout: 90_000 });
}

/** Replays a copied record the way an analysis would: a fresh game, then every move in order. */
function replay(record: string): GameState {
  const { v, config, actions } = JSON.parse(record) as { v: number; config: GameConfig; actions: Action[] };
  expect(v).toBe(2);
  let state = createGame(config);
  for (const action of actions) state = applyAction(state, action).state;
  return state;
}

test('Copy game puts the whole game on the clipboard, and it replays to the board on screen', async ({ page, context }, info) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await playToEnd(page);
  const copy = page.getByTestId('overlay-copy');
  await expect(copy).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('overlay-copy-status')).toBeHidden();
  await copy.click();
  await expect(page.getByTestId('overlay-copy-status')).toHaveText('Copied. Paste it anywhere to keep or share the game.');
  await expect(page.getByTestId('overlay-copy-text')).toHaveCount(0);

  const record = await page.evaluate(() => navigator.clipboard.readText());
  const onScreen = await page.evaluate(() => ({ state: window.__hexdice!.state()!, actions: window.__hexdice!.actions() }));
  expect(onScreen.state.winner).not.toBeNull();
  expect((JSON.parse(record) as { actions: Action[] }).actions).toEqual(onScreen.actions);
  expect(replay(record)).toEqual(onScreen.state);
  await shot(page, info, 'copied');
});

test('"You were eliminated" copies the game up to your knockout', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Seed 8 with eight players: if you only end your turn, you're out in round 9 (seed 3 did before the shaken rule).
  await page.goto('/?seed=8&players=8&ai=hard&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(async () => {
    const open = () => !!document.querySelector('[data-testid=overlay]:not([hidden])');
    for (let i = 0; i < 100 && !open(); i++) {
      await window.__hexdice!.idle();
      if (!open()) await window.__hexdice!.endTurn().catch(() => {});
    }
  });
  await expect(page.getByTestId('overlay-heading')).toHaveText('You were eliminated');
  await page.getByTestId('overlay-copy').click();
  await expect(page.getByTestId('overlay-copy-status')).toHaveText('Copied. Paste it anywhere to keep or share the game.');
  const record = await page.evaluate(() => navigator.clipboard.readText());
  const state = await page.evaluate(() => window.__hexdice!.state()!);
  expect(state.winner).toBeNull();
  expect(replay(record)).toEqual(state);
});

test('without a clipboard, Copy game shows the record in a field with the text selected', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => undefined }));
  await playToEnd(page);
  await page.getByTestId('overlay-copy').click();
  await expect(page.getByTestId('overlay-copy-status')).toHaveText('Select the text below and copy it.');
  const field = page.getByTestId('overlay-copy-text');
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
  const { value, selected } = await field.evaluate((f: HTMLTextAreaElement) => ({ value: f.value, selected: f.selectionEnd - f.selectionStart }));
  expect(selected).toBe(value.length);
  expect(replay(value)).toEqual(await page.evaluate(() => window.__hexdice!.state()!));

  // A second press doesn't stack another field.
  await page.getByTestId('overlay-copy').click();
  await expect(field).toHaveCount(1);
  for (const id of ['overlay-replay', 'overlay-title', 'overlay-copy']) await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, info, 'fallback');
});
