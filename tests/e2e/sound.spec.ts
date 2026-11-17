import { expect, test, type Page } from '@playwright/test';
import type { AttackRolledEvent } from '../../src/engine/types';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
}

/** Attacks by tapping, so the taps are real user gestures that unlock audio. */
async function attackByTapping(page: Page): Promise<AttackRolledEvent> {
  const { from, to } = await page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    for (const t of s.territories) {
      if (t.owner !== s.current || t.dice < 2) continue;
      const to = t.neighbours.find((n) => s.territories[n]!.owner !== s.current);
      if (to !== undefined) return { from: t.id, to };
    }
    throw new Error('no legal attack');
  });
  await page.getByTestId(`token-${from}`).click();
  await page.getByTestId(`token-${to}`).click();
  await page.evaluate(() => window.__hexdice!.idle());
  return page.evaluate(() => window.__hexdice!.events().find((e) => e.type === 'attackRolled') as AttackRolledEvent);
}

const sounds = (page: Page) => page.evaluate(() => window.__hexdice!.sounds());

test('an attack plays the dice, then its result', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=normal&sound=on');
  await ready(page);
  const roll = await attackByTapping(page);
  const result = roll.success ? 'capture' : roll.attackSum === roll.defendSum ? 'draw' : 'held';
  expect(await sounds(page)).toEqual(['dice', result]);
});

test('the sound toggle mutes, is remembered, and shows on the title screen', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=normal');
  await ready(page);
  const toggle = page.getByRole('button', { name: 'Sound' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('hexdice:sound'))).toBe('off');

  await attackByTapping(page);
  expect(await sounds(page)).toEqual([]);

  await page.goto('/');
  const titleToggle = page.getByTestId('title').getByRole('button', { name: 'Sound' });
  await expect(titleToggle).toHaveAttribute('aria-pressed', 'false');
  await titleToggle.click();
  await expect(titleToggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('hexdice:sound'))).toBe('on');
});

test('?sound=off mutes this visit without changing the remembered setting', async ({ page }) => {
  await page.goto('/?seed=42&players=4&sound=off');
  await ready(page);
  await expect(page.getByTestId('sound')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('hexdice:sound'))).toBeNull();
});
