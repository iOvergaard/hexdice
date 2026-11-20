import { expect, test } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';
import type { GameState } from '../../src/engine/types';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
    __overflow?: number;
  }
}

test('a floating label over a territory at the top edge stays on the board', async ({ page }, info) => {
  await page.goto('/?seed=1&players=8&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice);
  await page.evaluate(() => window.__hexdice!.idle());
  // You hold only the territory drawn nearest the top of the board, so your one new die lands there.
  const top = await page.evaluate(() => {
    const tokens = [...document.querySelectorAll<SVGGElement>('[data-token-for]')];
    const y = (t: SVGGElement) => t.getBoundingClientRect().top;
    const id = Number(tokens.reduce((a, b) => (y(b) < y(a) ? b : a)).dataset.tokenFor);
    const s: GameState = structuredClone(window.__hexdice!.state()!);
    const human = s.players.find((p) => p.kind === 'human')!.id;
    const ais = s.players.filter((p) => p.kind === 'ai').map((p) => p.id);
    s.territories.forEach((t) => {
      t.owner = t.id === id ? human : ais[t.id % 2]!;
      t.dice = t.id === id ? 3 : 2;
    });
    s.players.forEach((p) => (p.alive = p.id === human || p.id === ais[0] || p.id === ais[1]));
    s.current = human;
    window.__hexdice!.load(s);
    return id;
  });

  // The label lives for under half a second, so it's measured the moment it's added.
  await page.evaluate((id) => {
    const svg = document.querySelector<SVGSVGElement>('[data-testid="board"]')!;
    new MutationObserver(() => {
      const t = svg.querySelector<SVGTextElement>(`[data-testid="placement-${id}"]`);
      if (!t || window.__overflow !== undefined) return;
      const vb = svg.viewBox.baseVal;
      const b = t.getBBox();
      // The float lifts the label 14 units before it fades; all of that stays inside the view.
      window.__overflow = Math.max(0, vb.y - (b.y - 14), vb.x - b.x, b.x + b.width - (vb.x + vb.width));
    }).observe(svg.querySelector('.layer-placements')!, { childList: true });
  }, top);
  await page.getByTestId('speed').selectOption('slow');
  await page.getByTestId('end-turn').click();
  await page.waitForFunction(() => window.__overflow !== undefined);
  await page.screenshot({ path: `playtest/screens/label-top-edge-${info.project.name}.png` });
  expect(await page.evaluate(() => window.__overflow)).toBe(0);
});
