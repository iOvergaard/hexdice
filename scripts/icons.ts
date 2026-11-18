// Renders public/favicon.svg into the PNG/ICO icons and the link-preview image. Usage: npm run icons
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'public';
const mark = `data:image/svg+xml,${encodeURIComponent(readFileSync(`${DIR}/favicon.svg`, 'utf8'))}`;

// Shallow water around the island, deep sea at the edges, as on the board (src/ui/terrain.ts).
const SEA = 'radial-gradient(circle at 50% 50%, #3a80b1 0%, #27659a 45%, #1d4f86 75%)';
const SURF = 'drop-shadow(0 0 0.04em rgba(234, 247, 243, 0.6))';

interface Tile {
  file: string;
  size: number;
  /** Mark height as a share of the tile. */
  mark: number;
  /** Corner radius as a share of the tile; omitted for full bleed. */
  radius?: number;
  /** No backdrop: just the mark on transparency. */
  bare?: boolean;
}

const TILES: Tile[] = [
  // Home-screen icons: iOS rounds the corners itself and wants no transparency.
  { file: 'apple-touch-icon.png', size: 180, mark: 0.8 },
  { file: 'icon-192.png', size: 192, mark: 0.78, radius: 0.22 },
  { file: 'icon-512.png', size: 512, mark: 0.78, radius: 0.22 },
  // Maskable: launchers crop to a shape inside the central 80% circle, so the mark stays well inside it.
  { file: 'icon-maskable-512.png', size: 512, mark: 0.66 },
];

const ICO_SIZES = [16, 32, 48];

function tileHtml(t: Tile): string {
  const backdrop = t.bare ? '' : `background:${SEA};border-radius:${(t.radius ?? 0) * 100}%;`;
  return `<body style="margin:0">
    <div style="width:${t.size}px;height:${t.size}px;display:grid;place-items:center;font-size:${t.size}px;${backdrop}">
      <img src="${mark}" style="height:${t.mark * t.size}px;${t.bare ? '' : `filter:${SURF}`}">
    </div></body>`;
}

const ogHtml = `<body style="margin:0">
  <div style="width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 80px;box-sizing:border-box;
    background:radial-gradient(circle at 25% 50%, #3a80b1 0%, #27659a 28%, #1d4f86 60%);color:#eef0fb;
    font-family:ui-rounded,'SF Pro Rounded','Avenir Next','Segoe UI',system-ui,sans-serif;font-size:380px">
    <img src="${mark}" style="height:380px;filter:${SURF}">
    <div style="white-space:nowrap">
      <div style="font-size:136px;font-weight:900;letter-spacing:-0.04em;line-height:0.95">Hexdice</div>
      <div style="font-size:40px;font-weight:600;margin-top:24px;color:#e6eaff">Roll your dice, take the map.</div>
    </div>
  </div></body>`;

/** An ICO that wraps PNGs, which every current browser and Windows reads. */
function ico(pngs: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size, at);
    header.writeUInt8(size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

async function render(html: string, width: number, height: number, transparent: boolean): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  const png = await page.screenshot({ omitBackground: transparent });
  await page.close();
  return png;
}

const browser = await chromium.launch();
try {
  for (const t of TILES) {
    writeFileSync(`${DIR}/${t.file}`, await render(tileHtml(t), t.size, t.size, t.radius !== undefined || !!t.bare));
    console.log(`${DIR}/${t.file}`);
  }
  const pngs = [];
  for (const size of ICO_SIZES) {
    pngs.push({ size, data: await render(tileHtml({ file: '', size, mark: 1, bare: true }), size, size, true) });
  }
  writeFileSync(`${DIR}/favicon.ico`, ico(pngs));
  console.log(`${DIR}/favicon.ico (${ICO_SIZES.join(', ')} px)`);
  writeFileSync(`${DIR}/og-image.png`, await render(ogHtml, 1200, 630, false));
  console.log(`${DIR}/og-image.png`);
} finally {
  await browser.close();
}
