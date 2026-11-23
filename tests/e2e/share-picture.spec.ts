import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { HexdiceDebug } from '../../src/debug';

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
    __shared?: { name: string; type: string; size: number }[];
  }
}

const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `playtest/screens/share-picture-${info.project.name}-${name}.png` });

const today = (): string => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

async function playToEnd(page: Page): Promise<void> {
  await page.goto('/?seed=42&players=4&speed=instant&sound=off');
  await page.waitForFunction(() => !!window.__hexdice?.state());
  await page.evaluate(() => window.__hexdice!.autoplay(true));
  await expect(page.getByTestId('overlay')).toBeVisible({ timeout: 90_000 });
}

/** The width and height of a PNG, read from its header. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('Copy picture puts a PNG of the ending on the clipboard', async ({ page, context }, info) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await playToEnd(page);
  const picture = page.getByTestId('overlay-picture');
  await expect(picture).toHaveText('Copy picture');
  await expect(picture).toBeInViewport({ ratio: 1 });
  await picture.click();
  await expect(page.getByTestId('overlay-copy-status')).toHaveText('Picture copied. Paste it into a message or post.');

  const png = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item!.getType('image/png');
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  const { width, height } = pngSize(Buffer.from(png));
  expect(width).toBe(1080);
  // Header, chart, caption, four scoreboard rows and the footer.
  expect(height).toBeGreaterThan(1200);
  expect(height).toBeLessThan(2000);
  await shot(page, info, 'copied');
});

test('where files can be shared, Share picture hands the PNG to the share sheet', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ClipboardItem', { value: undefined });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true });
    Object.defineProperty(Navigator.prototype, 'share', {
      value: async (data: { files: File[] }) => {
        window.__shared = data.files.map((f) => ({ name: f.name, type: f.type, size: f.size }));
      },
    });
  });
  await playToEnd(page);
  const picture = page.getByTestId('overlay-picture');
  await expect(picture).toHaveText('Share picture');
  await picture.click();
  await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([{ name: `hexdice-${today()}.png`, type: 'image/png', size: expect.any(Number) }]);
  // The share sheet says what happened, so the card doesn't.
  await expect(page.getByTestId('overlay-copy-status')).toBeHidden();
});

test('closing the share sheet does nothing; a share that fails saves the picture instead', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ClipboardItem', { value: undefined });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true });
    let calls = 0;
    Object.defineProperty(Navigator.prototype, 'share', {
      value: async () => {
        calls += 1;
        throw new DOMException('nope', calls === 1 ? 'AbortError' : 'NotAllowedError');
      },
    });
  });
  await playToEnd(page);
  const picture = page.getByTestId('overlay-picture');
  await picture.click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('overlay-copy-status')).toBeHidden();

  const download = page.waitForEvent('download');
  await picture.click();
  expect((await download).suggestedFilename()).toBe(`hexdice-${today()}.png`);
  await expect(page.getByTestId('overlay-copy-status')).toHaveText('Picture saved to your downloads.');
});

test('with neither a share sheet nor an image clipboard, Save picture downloads it', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ClipboardItem', { value: undefined });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
  });
  await playToEnd(page);
  const picture = page.getByTestId('overlay-picture');
  await expect(picture).toHaveText('Save picture');
  const download = page.waitForEvent('download');
  await picture.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`hexdice-${today()}.png`);
  const { readFile } = await import('node:fs/promises');
  expect(pngSize(await readFile((await file.path())!)).width).toBe(1080);
  await expect(page.getByTestId('overlay-copy-status')).toHaveText('Picture saved to your downloads.');
  for (const id of ['overlay-replay', 'overlay-title', 'overlay-picture', 'overlay-copy']) await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, info, 'saved');
});
