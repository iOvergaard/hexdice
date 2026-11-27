import { expect, test, type Page } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import type { GameState } from '../../src/engine/types';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
}

const track = (page: Page) => page.evaluate(() => window.__hexdice!.music());

/** Loads the current game with only these players still in; `winner` makes you the winner. */
async function loadWith(page: Page, alive: 'you+1' | 'ai-only' | 'you', winner = false): Promise<void> {
  await page.evaluate(
    ({ alive, winner }) => {
      const s: GameState = structuredClone(window.__hexdice!.state()!);
      const human = s.players.find((p) => p.kind === 'human')!.id;
      const ais = s.players.filter((p) => p.kind === 'ai').map((p) => p.id);
      const keep = alive === 'you+1' ? [human, ais[0]!] : alive === 'ai-only' ? ais.slice(0, 2) : [human];
      s.territories.forEach((t, i) => (t.owner = keep[i % keep.length]!));
      s.players.forEach((p) => (p.alive = keep.includes(p.id)));
      s.current = keep[0]!;
      if (winner) s.winner = human;
      window.__hexdice!.load(s);
    },
    { alive, winner },
  );
}

test('the music toggle is off at first, is remembered, and shows on the title screen', async ({ page }) => {
  await page.goto('/?seed=42&players=4&sound=off');
  await ready(page);
  const toggle = page.getByTestId('music');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('hexdice:music'))).toBe('on');

  await page.goto('/');
  const titleToggle = page.getByTestId('title').getByRole('button', { name: 'Music' });
  await expect(titleToggle).toHaveAttribute('aria-pressed', 'true');
  await titleToggle.click();
  await expect(titleToggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('hexdice:music'))).toBe('off');
});

test("the music follows the game: The Bard's Tale, Battle with two left, then victory or defeat", async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=instant&sound=off');
  await ready(page);
  expect(await track(page)).toBe('bards-tale');
  await loadWith(page, 'you+1');
  expect(await track(page)).toBe('battle');
  await loadWith(page, 'ai-only');
  expect(await track(page)).toBe('defeat');
  await loadWith(page, 'you', true);
  expect(await track(page)).toBe('victory');
  await page.getByTestId('overlay-title').click();
  expect(await track(page)).toBeNull();
});

test('with sound and music on, the first tap fetches the track and plays it', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=normal&sound=on&music=on');
  await ready(page);
  const fetched = page.waitForRequest((r) => r.url().endsWith('/music/bards-tale.m4a'));
  await page.getByTestId('round').click(); // any tap unlocks audio
  expect((await (await fetched).response())?.ok()).toBe(true);
});
