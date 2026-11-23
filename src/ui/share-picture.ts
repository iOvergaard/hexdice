// The end-of-game card as a PNG, to share in a chat or post: same title, chart and scoreboard as on screen.
import type { Ending } from './ending';
import { CHART_H, CHART_W, LANE, SCORE_HEADINGS, SCORE_NOTE, chartShapes, endingCopy, leadOf, scoreRows } from './ending';
import { emblemPath, pipColour, playerColour } from './identity';

/** The picture's width in CSS pixels; it's drawn at twice that. */
export const PICTURE_W = 540;
const SCALE = 2;
const PAD = 24;
const SITE = 'hexdice.snebold.dk';

const INK = '#11152b';
const SEA = '#1a2142';
const LINE = '#3d4880';
const TEXT = '#eef0fb';
const MUTED = '#a7afd8';
const PAPER = '#f1efff';
const FONT = "ui-rounded, 'SF Pro Rounded', 'Avenir Next', 'Segoe UI', system-ui, sans-serif";

/** Splits text into lines no wider than `max`. A word wider than `max` gets a line to itself. Pure. */
export function wrapText(text: string, max: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** DD-MM-YYYY in local time. */
export function pictureDate(d: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${two(d.getDate())}-${two(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** Shortens text with an ellipsis until it fits. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function emblem(ctx: CanvasRenderingContext2D, identity: number, cx: number, cy: number, radius: number, fill: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(radius / 10, radius / 10);
  ctx.fillStyle = fill;
  ctx.fill(new Path2D(emblemPath(identity, 10)));
  ctx.restore();
}

/** Lays the card out from the top; draws it too when `paint` is set. Returns the height used. */
function layout(ctx: CanvasRenderingContext2D, e: Ending, footer: string, paint: boolean): number {
  const W = PICTURE_W;
  const inner = W - 2 * PAD;
  const lead = e.players[leadOf(e)]!;
  const colour = playerColour(lead.identity);
  const onColour = pipColour(colour);
  const copy = endingCopy(e);
  const font = (weight: number, size: number): void => {
    ctx.font = `${weight} ${size}px ${FONT}`;
  };
  const text = (s: string, x: number, y: number, fill: string, align: CanvasTextAlign = 'left'): void => {
    if (!paint) return;
    ctx.fillStyle = fill;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  ctx.textBaseline = 'alphabetic';

  // Head: the lead player's colour, emblem, title and the line under it.
  font(700, 17);
  const sub = wrapText(copy.sub, inner, (s) => ctx.measureText(s).width);
  const headH = 26 + 68 + 12 + 46 + 8 + sub.length * 24 + 20;
  if (paint) {
    ctx.fillStyle = SEA;
    ctx.fillRect(0, 0, W, ctx.canvas.height / SCALE);
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, W, headH);
    emblem(ctx, lead.identity, W / 2, 26 + 34, 34, onColour);
  }
  let y = 26 + 68 + 12 + 40;
  font(900, 46);
  text(fit(ctx, e.title, inner), W / 2, y, onColour, 'center');
  y += 14;
  font(700, 17);
  for (const line of sub) {
    y += 22;
    text(line, W / 2, y, onColour, 'center');
    y += 2;
  }
  y = headH + 18;

  // Chart: territories held over the game, with the knockouts above it.
  const k = inner / CHART_W;
  const shapes = chartShapes(e);
  if (paint) {
    ctx.save();
    ctx.translate(PAD, y + LANE * k);
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    for (const b of shapes.bands) {
      const p = new Path2D(b.d);
      ctx.fillStyle = b.fill;
      ctx.fill(p);
      ctx.strokeStyle = SEA;
      ctx.lineWidth = 1.5;
      ctx.stroke(p);
    }
    if (shapes.yours) {
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 2;
      ctx.stroke(new Path2D(shapes.yours));
    }
    for (const m of shapes.marks) {
      ctx.strokeStyle = MUTED;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(m.x, -LANE / 2 + 7);
      ctx.lineTo(m.x, 3);
      ctx.stroke();
      emblem(ctx, m.identity, m.x, -LANE / 2, 6.5, playerColour(m.identity));
    }
    ctx.restore();
  }
  y += (LANE + CHART_H) * k + 20;
  font(500, 13);
  text(`Round ${e.summary.timeline[0]!.round}`, PAD, y, MUTED);
  text('Territories held', W / 2, y, MUTED, 'center');
  text(`Round ${e.summary.rounds}`, W - PAD, y, MUTED, 'right');

  // Caption: the story of the game.
  if (copy.caption) {
    font(600, 16);
    y += 8;
    for (const line of wrapText(copy.caption, inner, (s) => ctx.measureText(s).width)) {
      y += 22;
      text(line, PAD, y, TEXT);
    }
  }

  // Scoreboard.
  const col = { place: PAD, badge: PAD + 40, name: PAD + 66, out: PAD + 268, attacks: PAD + 404, defences: W - PAD };
  y += 30;
  font(700, 12);
  const [, player, out, attacks, defences] = SCORE_HEADINGS;
  text(player, col.badge, y, MUTED);
  text(out, col.out, y, MUTED);
  text(attacks, col.attacks, y, MUTED, 'right');
  text(defences, col.defences, y, MUTED, 'right');
  y += 8;
  for (const r of scoreRows(e)) {
    if (paint) {
      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, y, inner, 1);
      ctx.fillStyle = playerColour(r.identity);
      ctx.beginPath();
      ctx.roundRect(col.badge, y + 7, 18, 18, 5);
      ctx.fill();
      emblem(ctx, r.identity, col.badge + 9, y + 16, 6.5, INK);
    }
    const base = y + 21;
    const fill = r.you ? PAPER : TEXT;
    font(r.you ? 800 : 500, 15);
    text(r.place, col.place, base, r.you ? PAPER : MUTED);
    font(r.you ? 800 : 600, 15);
    text(fit(ctx, r.name, col.out - col.name - 10), col.name, base, fill);
    font(r.you ? 800 : 500, 15);
    text(r.out, col.out, base, fill);
    text(r.attacks, col.attacks, base, fill, 'right');
    text(r.defences, col.defences, base, fill, 'right');
    y += 32;
  }
  y += 18;
  font(500, 12);
  text(SCORE_NOTE, PAD, y, MUTED);

  // Footer: where to play, and the seed so someone can play the same map.
  y += 22;
  if (paint) {
    ctx.fillStyle = LINE;
    ctx.fillRect(0, y, W, 1);
  }
  y += 30;
  font(800, 15);
  text(SITE, PAD, y, TEXT);
  font(500, 13);
  text(footer, W - PAD, y, MUTED, 'right');
  return y + 20;
}

/** Draws the card onto a new canvas at twice its CSS size. */
export function drawPicture(e: Ending, footer: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PICTURE_W * SCALE;
  const measure = canvas.getContext('2d')!;
  const height = Math.ceil(layout(measure, e, footer, false));
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  layout(ctx, e, footer, true);
  return canvas;
}

export function pictureBlob(e: Ending, footer: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    drawPicture(e, footer).toBlob((b) => (b ? resolve(b) : reject(new Error('No picture'))), 'image/png');
  });
}

/** How this browser hands the picture over: the share sheet on phones, the clipboard on computers, else a download. */
export type PictureWay = 'share' | 'copy' | 'save';

function canShareFiles(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File([], 'hexdice.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
}

export function pictureWay(): PictureWay {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && canShareFiles()) return 'share';
  if (canCopyImage()) return 'copy';
  if (canShareFiles()) return 'share';
  return 'save';
}

export const PICTURE_LABEL: Record<PictureWay, string> = { share: 'Share picture', copy: 'Copy picture', save: 'Save picture' };

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Hands the picture over the way `way` says. Resolves to the line for the status, or null when there's nothing to say. */
export async function sendPicture(way: PictureWay, blob: Promise<Blob>, name: string): Promise<string | null> {
  if (way === 'copy') {
    try {
      // The item takes the promise, so Safari still counts the write as part of the click.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'Picture copied. Paste it into a message or post.';
    } catch {
      return sendPicture('save', blob, name);
    }
  }
  if (way === 'share') {
    try {
      await navigator.share({ files: [new File([await blob], name, { type: 'image/png' })] });
      return null;
    } catch (err) {
      // Closing the share sheet isn't a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      return sendPicture('save', blob, name);
    }
  }
  save(await blob, name);
  return 'Picture saved to your downloads.';
}
