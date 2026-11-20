import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { diceAfterFailedAttack } from '../../src/engine/rules';
import type { AttackRolledEvent, GameEvent, GameState } from '../../src/engine/types';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
    __strip?: string[];
  }
}

const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `playtest/screens/game-${info.project.name}-${name}.png` });

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.idle());
}

/** Picks a legal human attack, preferring the one with the most dice on the attacker. */
async function findAttack(page: Page): Promise<{ from: number; to: number }> {
  return page.evaluate(() => {
    const s = window.__hexdice!.state()!;
    let best: { from: number; to: number; dice: number } | null = null;
    for (const t of s.territories) {
      if (t.owner !== s.current || t.dice < 2) continue;
      for (const n of t.neighbours) {
        if (s.territories[n]!.owner !== s.current && (!best || t.dice > best.dice)) best = { from: t.id, to: n, dice: t.dice };
      }
    }
    if (!best) throw new Error('no legal attack');
    return { from: best.from, to: best.to };
  });
}

test('title → preview → game', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('players-4').click();
  await shot(page, info, 'title');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('preview')).toBeVisible();
  const seedBefore = await page.getByTestId('preview-seed').textContent();
  await page.getByTestId('preview-no').click();
  await expect(page.getByTestId('preview-seed')).not.toHaveText(seedBefore!);
  await shot(page, info, 'preview');
  await page.getByTestId('preview-yes').click();
  await expect(page.getByTestId('preview')).toBeHidden();
  await expect(page.locator('[data-territory]')).toHaveCount(30);
  await expect(page.getByTestId('player-3')).toBeVisible();
  await expect(page.getByTestId('player-4')).toHaveCount(0);
});

test('attacks by tapping', async ({ page }, info) => {
  await page.goto('/?seed=42&players=4&speed=instant');
  await ready(page);
  const { from, to } = await findAttack(page);
  await page.getByTestId(`token-${from}`).click();
  await shot(page, info, 'selected');
  await page.getByTestId(`token-${to}`).click();
  await expect(page.getByTestId('roll-attacker-sum')).not.toBeEmpty();
  await expect(page.getByTestId('roll-defender-sum')).not.toBeEmpty();
  await page.evaluate(() => window.__hexdice!.idle());
  const after = await page.evaluate((id) => {
    const h = window.__hexdice!;
    const roll = h.events().find((e) => e.type === 'attackRolled') as AttackRolledEvent;
    return { dice: h.state()!.territories[id]!.dice, config: h.state()!.config, roll };
  }, from);
  const { roll } = after;
  const draw = roll.attackSum === roll.defendSum;
  const expected = roll.success ? 1 : diceAfterFailedAttack(after.config, roll.attackRolls.length, roll.defendRolls.length, draw);
  expect(after.dice).toBe(expected);
  expect(await page.evaluate(() => window.__hexdice!.actions().length)).toBe(1);
  await shot(page, info, 'after-attack');
});

test('ignores taps while busy', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=slow');
  await ready(page);
  const { from, to } = await findAttack(page);
  await page.getByTestId(`token-${from}`).click();
  const target = page.getByTestId(`token-${to}`);
  for (let i = 0; i < 5; i++) await target.click({ noWaitAfter: true, force: true });
  await page.getByTestId('end-turn').click({ force: true, noWaitAfter: true });
  const rolled = await page.evaluate(() => window.__hexdice!.events().filter((e: GameEvent) => e.type === 'attackRolled').length);
  expect(rolled).toBe(1);
  expect(await page.evaluate(() => window.__hexdice!.actions())).toHaveLength(1);
});

test('ends turn and the AIs play', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=instant');
  await ready(page);
  const startRound = await page.evaluate(() => window.__hexdice!.state()!.round);
  await page.getByTestId('end-turn').click();
  await page.evaluate(() => window.__hexdice!.idle());
  const s = await page.evaluate(() => window.__hexdice!.state()!);
  expect(s.round).toBe(startRound + 1);
  expect(s.players[s.current]!.kind).toBe('human');
  await expect(page.getByTestId('round')).toHaveText(`Round ${s.round}`);
});

test('skip plays the rest of the round instantly', async ({ page }) => {
  await page.goto('/?seed=42&players=8&speed=slow');
  await ready(page);
  const startRound = await page.evaluate(() => window.__hexdice!.state()!.round);
  const button = page.getByTestId('end-turn');
  await button.click();
  await expect(button).toHaveText('Skip to my turn');
  await expect(button).toBeEnabled();
  const started = Date.now();
  await button.click();
  await page.evaluate(() => window.__hexdice!.idle());
  expect(Date.now() - started).toBeLessThan(5_000);
  expect(await page.evaluate(() => window.__hexdice!.state()!.round)).toBe(startRound + 1);
  await expect(button).toHaveText('End turn');
});

test('autoplay reaches game over and replay runs', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto('/?seed=7&players=4&speed=instant');
  await ready(page);
  await page.evaluate(() => window.__hexdice!.autoplay(true));
  await expect(page.getByTestId('overlay')).toBeVisible({ timeout: 60_000 });
  await shot(page, info, 'gameover');
  const finalState = await page.evaluate(() => window.__hexdice!.state()!);
  await page.getByTestId('overlay-replay').click();
  await expect(page.getByTestId('overlay')).toBeHidden();
  await expect(page.getByTestId('overlay')).toBeVisible({ timeout: 60_000 });
  const replayed = await page.evaluate(() => window.__hexdice!.state()!);
  expect(replayed.winner).toBe(finalState.winner);
  expect(replayed.territories.map((t) => [t.owner, t.dice])).toEqual(finalState.territories.map((t) => [t.owner, t.dice]));
});

test('a knockout shows a big bang', async ({ page }, info) => {
  await page.goto('/?seed=5&players=3&speed=slow');
  await ready(page);
  // Your 8-dice territory borders an AI's only territory (1 die): the attack can't fail and knocks it out.
  const { from, to } = await page.evaluate(() => {
    const s: GameState = structuredClone(window.__hexdice!.state()!);
    const human = s.players.find((p) => p.kind === 'human')!.id;
    const [victim, other] = s.players.filter((p) => p.kind === 'ai').map((p) => p.id);
    const source = s.territories.find((t) => t.neighbours.length > 0)!;
    const target = s.territories[source.neighbours[0]!]!;
    s.territories.forEach((t) => {
      t.owner = other!;
      t.dice = 2;
    });
    source.owner = human;
    source.dice = 8;
    target.owner = victim!;
    target.dice = 1;
    s.players.forEach((p) => (p.alive = true));
    s.current = human;
    window.__hexdice!.load(s);
    return { from: source.id, to: target.id };
  });
  await page.getByTestId(`token-${from}`).click();
  await page.getByTestId(`token-${to}`).click();
  const banner = page.getByTestId('elimination-banner');
  await expect(banner).toBeVisible({ timeout: 5_000 });
  await expect(banner).toContainText('eliminated');
  await expect(banner).toContainText('by you · you now get +1 die per turn');
  await expect(page.getByTestId('elimination-burst')).toHaveCount(1);
  await page.waitForTimeout(250);
  await shot(page, info, 'knockout');
  await expect(banner).toBeHidden({ timeout: 6_000 });
  await expect(page.getByTestId('elimination-burst')).toHaveCount(0);
});

test('eliminated player can watch the rest', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto('/?seed=5&players=3&speed=instant');
  await ready(page);
  // Human keeps one 1-die territory beside an 8-die AI stack; the other two AIs split the rest. It's an AI's turn.
  await page.evaluate(() => {
    const s: GameState = structuredClone(window.__hexdice!.state()!);
    const human = s.players.find((p) => p.kind === 'human')!.id;
    const ais = s.players.filter((p) => p.kind === 'ai').map((p) => p.id);
    const victim = s.territories.find((t) => t.neighbours.length > 0)!;
    victim.owner = human;
    victim.dice = 1;
    const attacker = s.territories[victim.neighbours[0]!]!;
    s.territories.forEach((t, i) => {
      if (t.id === victim.id) return;
      t.owner = t.id === attacker.id ? ais[0]! : ais[i % 2]!;
      t.dice = t.id === attacker.id ? 8 : 2;
    });
    s.players.forEach((p) => (p.alive = true));
    s.current = ais[0]!;
    window.__hexdice!.load(s);
  });
  // Keep ending our turn until the AI has taken our last territory.
  const watch = page.getByTestId('overlay-watch');
  for (let i = 0; i < 40 && !(await watch.isVisible()); i++) {
    if (await page.evaluate(() => window.__hexdice!.state()!.players.find((p) => p.kind === 'human')!.alive)) {
      await page.evaluate(() => window.__hexdice!.idle());
      if (await watch.isVisible()) break;
      await page.evaluate(() => window.__hexdice!.endTurn()).catch(() => {});
    }
    await page.waitForTimeout(50);
  }
  await expect(page.getByTestId('overlay-heading')).toHaveText('You were eliminated');
  await expect(page.getByTestId('ending-sub')).toHaveText(/^You came (2nd|3rd) of 3\.$/);
  await expect(page.getByTestId('ending-caption')).toContainText('took your last one in round');
  await expect(page.getByTestId('overlay-title')).toBeVisible();
  // A loaded position's moves aren't the whole game, so there's nothing to copy.
  await expect(page.getByTestId('overlay-copy')).toHaveCount(0);
  await shot(page, info, 'eliminated');
  const before = await page.evaluate(() => window.__hexdice!.actions().length);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__hexdice!.actions().length)).toBe(before);
  await watch.click();
  await expect(page.getByTestId('overlay-heading')).toContainText('wins', { timeout: 90_000 });
  await expect(page.getByTestId('overlay-watch')).toHaveCount(0);
});

test('shows where reinforcements land', async ({ page }, info) => {
  await page.goto('/?seed=42&players=4&speed=slow');
  await ready(page);
  await page.getByTestId('end-turn').click();
  // Your new dice wait in a pile that drains as each one lands.
  await expect(page.getByTestId('roll-pile')).toBeVisible();
  await expect(page.getByTestId('roll-pile-caption')).toHaveText('+5 · largest group 5');
  await expect(page.locator('[data-testid^="placement-"]').first()).toBeVisible();
  await shot(page, info, 'reinforcements');
  await expect(page.getByTestId('roll-pile-count')).toHaveText('0');
});

test('at Fast, reinforcements land at once without the pile', async ({ page }) => {
  await page.goto('/?seed=42&players=4&speed=fast');
  await ready(page);
  // The message only shows for 300 ms, so record everything the strip shows while the round plays.
  await page.evaluate(() => {
    const roll = document.querySelector('[data-testid="roll"]')!;
    const strip: string[] = (window.__strip = []);
    new MutationObserver(() => strip.push(`${roll.className} | ${roll.querySelector('[data-testid="roll-message"]')!.textContent}`)).observe(roll, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.getByTestId('end-turn').click();
  await page.evaluate(() => window.__hexdice!.idle());
  const strip = await page.evaluate(() => window.__strip!);
  expect(strip.some((s) => s.includes('largest group'))).toBe(true);
  expect(strip.some((s) => s.includes('is-pile'))).toBe(false);
});

test('shows a your-turn cue', async ({ page }, info) => {
  await page.goto('/?seed=42&players=4&speed=instant');
  await ready(page);
  await page.getByTestId('end-turn').click();
  await page.evaluate(() => window.__hexdice!.idle());
  await expect(page.getByTestId('roll-message')).toContainText('Your turn');
  await shot(page, info, 'your-turn');
});

test('preview names your colour', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('players-4').click();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('preview-you')).toBeVisible();
  await shot(page, info, 'preview-you');
});

test('player bar shows the knockout bonus', async ({ page }, info) => {
  await page.goto('/?seed=42&players=4&speed=instant');
  await ready(page);
  const id = await page.evaluate(() => {
    const s: GameState = structuredClone(window.__hexdice!.state()!);
    const human = s.players.find((p) => p.kind === 'human')!;
    human.knockouts = 1;
    window.__hexdice!.load(s);
    return human.id;
  });
  await expect(page.getByTestId(`player-${id}-bonus`)).toHaveText('+1/turn');
  await shot(page, info, 'knockout-bonus');
});

test('phone layout fits', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  await page.goto('/?seed=42&players=4&speed=instant');
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const vp = page.viewportSize()!;
  for (const id of ['roll', 'board', 'end-turn']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  }
  await shot(page, info, 'layout');
});
