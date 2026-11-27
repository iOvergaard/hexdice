import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';

const host = `ws://localhost:${process.env.E2E_HOST_PORT}`;
const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `playtest/screens/online-${info.project.name}-${name}.png`, fullPage: true });

async function person(browser: Browser, info: TestInfo, query = '') {
  const context = await browser.newContext(info.project.use);
  const page = await context.newPage();
  await page.goto(`/?sound=off&speed=instant&host=${encodeURIComponent(host)}${query}`);
  return page;
}

const owners = (page: Page) => page.evaluate(() => window.__hexdice!.state()!.territories.map((t) => `${t.owner}/${t.dice}`).join(','));

test('two people play one game: create, join by link, start, take turns, leave', async ({ browser }, info) => {
  const ann = await person(browser, info);
  await ann.getByTestId('play-online').click();
  await expect(ann.getByTestId('online')).toBeVisible();
  await ann.getByTestId('online-name').fill('Ann');
  await ann.getByTestId('online-seats-2').click();
  await ann.getByTestId('online-turn-0').click();
  await shot(ann, info, 'setup');
  expect(await ann.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await ann.getByTestId('online-create').click();
  await expect(ann.getByTestId('lobby')).toBeVisible();
  const code = (await ann.getByTestId('lobby-code').textContent())!;
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  await expect(ann.getByTestId('lobby-start')).toBeDisabled();
  expect(await ann.getByTestId('lobby-link').inputValue()).toContain(`room=${code}`);

  // Ben opens the link: the code is filled in, he types his name and joins.
  const ben = await person(browser, info, `&room=${code}`);
  await expect(ben.getByTestId('online-code')).toHaveValue(code);
  await ben.getByTestId('online-name').fill('Ben');
  await ben.getByTestId('online-join').click();
  await expect(ben.getByTestId('lobby-seats').locator('.seat')).toHaveCount(2);
  await expect(ben.getByTestId('lobby-status')).toHaveText('Waiting for Ann to start.');
  await expect(ann.getByTestId('lobby-seats')).toContainText('Ben');
  await shot(ann, info, 'lobby');

  await ann.getByTestId('lobby-start').click();
  for (const p of [ann, ben]) await expect(p.getByTestId('board')).toBeVisible();
  await expect.poll(async () => (await owners(ann)) === (await owners(ben))).toBe(true);

  // Exactly one of them may move; the other is told whom they're waiting for.
  const annFirst = (await ann.getByTestId('roll-message').textContent())!.startsWith('Your turn');
  const [first, second, firstName] = annFirst ? [ann, ben, 'Ann'] : [ben, ann, 'Ben'];
  await expect(first.getByTestId('roll-message')).toHaveText(/^Your turn/);
  await expect(second.getByTestId('roll-message')).toHaveText(`Waiting for ${firstName}`);
  await expect(first.getByTestId('end-turn')).toBeEnabled();
  await expect(second.getByTestId('end-turn')).toBeDisabled();
  await expect(first.locator('.chip.is-you')).toHaveCount(1);
  await shot(first, info, 'your-turn');

  // An attack from the first player's board shows up on the other's.
  const attack = await first.evaluate(() => {
    const s = window.__hexdice!.state()!;
    for (const t of s.territories) {
      if (t.owner !== s.current || t.dice < 2) continue;
      const to = t.neighbours.find((n) => s.territories[n]!.owner !== s.current);
      if (to !== undefined) return { from: t.id, to };
    }
    return null;
  });
  if (attack) {
    await first.getByTestId(`token-${attack.from}`).click();
    await first.getByTestId(`token-${attack.to}`).click();
    await expect.poll(async () => (await owners(first)) === (await owners(second)) && (await first.evaluate(() => window.__hexdice!.events().length)) > 0).toBe(true);
  }

  await first.getByTestId('end-turn').click();
  await expect(second.getByTestId('roll-message')).toHaveText(/^Your turn/);
  await expect(first.getByTestId('roll-message')).toHaveText(/^Waiting for/);
  await expect.poll(async () => (await owners(ann)) === (await owners(ben))).toBe(true);

  // Leaving hands the seat to the host's Hard player; the game goes on for the other.
  await expect(second.getByTestId('quit')).toHaveText('Leave');
  await second.getByTestId('quit').click();
  await expect(second.getByTestId('title')).toBeVisible();
  // Hard plays the turn that was theirs at once, so it's back to the one still here.
  await expect(first.getByTestId('roll-message')).toHaveText(/^Your turn/);
});

test('anyone can watch a room, and the board follows the game', async ({ browser }, info) => {
  const ann = await person(browser, info);
  await ann.getByTestId('play-online').click();
  await ann.getByTestId('online-name').fill('Ann');
  await ann.getByTestId('online-seats-3').click();
  await ann.getByTestId('online-fill-easy').click();
  await ann.getByTestId('online-create').click();
  const code = (await ann.getByTestId('lobby-code').textContent())!;
  await expect(ann.getByTestId('lobby-seats')).toContainText('Computer (easy)');
  await ann.getByTestId('lobby-start').click();
  await expect(ann.getByTestId('roll-message')).toHaveText(/^Your turn/);

  const cat = await person(browser, info);
  await cat.getByTestId('play-online').click();
  await cat.getByTestId('online-refresh').click();
  await cat.getByTestId(`online-room-watch-${code}`).click();
  await expect(cat.getByTestId('board')).toBeVisible();
  await expect(cat.getByTestId('end-turn')).toBeDisabled();
  await expect(cat.locator('.chip.is-you')).toHaveCount(0);
  await expect(cat.getByTestId('roll-message')).toHaveText("Ann's turn");
  await expect.poll(async () => (await owners(ann)) === (await owners(cat))).toBe(true);

  await ann.getByTestId('end-turn').click();
  await expect(ann.getByTestId('roll-message')).toHaveText(/^Your turn/);
  await expect.poll(async () => (await owners(ann)) === (await owners(cat))).toBe(true);
  await shot(cat, info, 'watching');
});
