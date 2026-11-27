import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { build } from 'vite';
import { PagesServer } from './pages-server';

// Production builds only: the service worker is never registered on the dev server.

interface Build {
  dir: string;
  cache: string;
  script: string;
}

async function buildInto(dir: string, minify?: false): Promise<Build> {
  await build({ logLevel: 'warn', build: { outDir: dir, emptyOutDir: true, ...(minify === false ? { minify } : {}) } });
  const sw = await readFile(join(dir, 'sw.js'), 'utf8');
  const html = await readFile(join(dir, 'index.html'), 'utf8');
  return { dir, cache: /const CACHE = "([^"]+)"/.exec(sw)![1]!, script: /src="(\.\/assets\/[^"]+\.js)"/.exec(html)![1]! };
}

/** The worker is active and in control, so its cache is complete. */
async function offlineReady(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

const cacheNames = (page: Page) => page.evaluate(() => caches.keys());
const script = (page: Page) => page.locator('script[type="module"]').getAttribute('src');
const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `playtest/screens/offline-${info.project.name}-${name}.png` });

async function newGame(page: Page): Promise<void> {
  await page.getByTestId('opponents-3').click();
  await page.getByTestId('start').click();
  await page.getByTestId('preview-yes').click();
  await expect(page.getByTestId('preview')).toBeHidden();
  await expect(page.locator('[data-territory]').first()).toBeVisible();
}

test.describe('offline', () => {
  test.describe.configure({ mode: 'default' });

  let first: Build;
  let second: Build;
  let server: PagesServer;

  test.beforeAll(async ({}, info) => {
    const out = join(info.project.outputDir, `offline-builds-${info.workerIndex}`);
    first = await buildInto(join(out, 'first'));
    // Any change to the game makes a new build; turning off minification is the quickest one to make.
    second = await buildInto(join(out, 'second'), false);
    server = await PagesServer.start(first.dir);
  });

  test.afterAll(async () => {
    await server.stop();
  });

  test.beforeEach(() => {
    server.root = first.dir;
    server.stalled = false;
  });

  test('after one visit: the title, a new game and Continue all work offline', async ({ page, context }, info) => {
    await page.goto(server.url);
    await expect(page.getByTestId('title')).toBeVisible();
    await offlineReady(page);
    await expect(page.getByTestId('offline-status')).toHaveText('Ready to play offline');
    await newGame(page); // starting a game saves it, so Continue has something to resume

    await context.setOffline(true);
    const before = server.requests.length;
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.getByTestId('title')).toBeVisible();
    await expect(page.getByTestId('offline-status')).toHaveText('Ready to play offline');
    await shot(page, info, 'title');
    await page.getByTestId('continue').click();
    await expect(page.locator('[data-territory]').first()).toBeVisible();
    await shot(page, info, 'continue');

    await page.reload();
    await newGame(page);
    await shot(page, info, 'new-game');
    // Chromium's update check for the worker script ignores Playwright's offline mode; a real offline device fails it.
    const reached = server.requests.slice(before).filter((path) => path !== '/sw.js');
    expect(reached, 'nothing but the worker update check reached the server while offline').toEqual([]);
  });

  test('the title says when the game is saved for offline play', async ({ page, context }, info) => {
    // Hold the first install until the page has painted, so the saving state is on screen.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await context.route('**/favicon.svg', async (route) => {
      if (route.request().serviceWorker()) await held;
      await route.continue();
    });
    await page.goto(server.url);
    const note = page.getByTestId('offline-status');
    await expect(note).toHaveText('Saving for offline play…');
    await shot(page, info, 'saving');
    release();
    await expect(note).toHaveText('Ready to play offline');
    await shot(page, info, 'ready');
  });

  for (const [width, height] of [[750, 342], [568, 320]] as const) {
    test(`on a phone on its side (${width}×${height}), the note fits`, async ({ page }, info) => {
      await page.setViewportSize({ width, height });
      await page.goto(server.url);
      const note = page.getByTestId('offline-status');
      await expect(note).toHaveText('Ready to play offline');
      await note.scrollIntoViewIfNeeded();
      await expect(note).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await shot(page, info, `landscape-${width}x${height}`);
    });
  }

  test('a new deploy replaces the old build and deletes its cache', async ({ page, context }) => {
    expect(second.cache).not.toBe(first.cache);
    await page.goto(server.url);
    await offlineReady(page);
    expect(await cacheNames(page)).toEqual([first.cache]);
    expect(await script(page)).toBe(first.script);

    server.root = second.dir;
    // A plain visit, not a reload: the page is still fresh in the ten-minute HTTP cache, so only the
    // worker's revalidation finds the new build.
    await page.goto(server.url);
    expect(await script(page)).toBe(second.script);
    await expect.poll(() => cacheNames(page)).toEqual([second.cache]);

    await context.setOffline(true);
    await page.reload();
    expect(await script(page)).toBe(second.script);
    await newGame(page);
  });

  test('a track is kept the first time it plays, and plays offline after that', async ({ page, context }) => {
    const kept = () =>
      page.evaluate(() =>
        caches
          .open('hexdice-music')
          .then((c) => c.keys())
          .then((keys) => keys.map((r) => new URL(r.url).pathname)),
      );
    await page.goto(`${server.url}?music=on&sound=on`);
    await offlineReady(page);
    expect(await cacheNames(page)).toEqual([first.cache]); // nothing fetched up front
    await newGame(page);
    await expect.poll(kept).toEqual(['/music/bards-tale.m4a']);

    await context.setOffline(true);
    const before = server.requests.length;
    await page.reload();
    await newGame(page);
    await expect.poll(() => page.evaluate(() => window.__hexdice!.music())).toBe('bards-tale');
    expect(server.requests.slice(before).filter((path) => path.startsWith('/music/'))).toEqual([]);

    // A new deploy keeps the music.
    await context.setOffline(false);
    server.root = second.dir;
    await page.goto(server.url);
    await expect.poll(() => cacheNames(page)).toEqual(expect.arrayContaining([second.cache, 'hexdice-music']));
    expect(await kept()).toEqual(['/music/bards-tale.m4a']);
  });

  test('on a stalled connection, the offline copy loads after a few seconds', async ({ page }) => {
    await page.goto(server.url);
    await offlineReady(page);

    server.stalled = true;
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.getByTestId('title')).toBeVisible();
  });

  test('the dev server registers no service worker', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('title')).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))).toBe(0);
    await expect(page.getByTestId('offline-status')).toBeHidden();
  });
});
