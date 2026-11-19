// What's new for players. `scripts/changelog.ts` adds the Conventional Commits subjects on main to CHANGELOG.md;
// the game reads that file. Pure: no git, no file system.

export type ChangeKind = 'new' | 'rules' | 'fix' | 'perf';

/** One player-facing change. */
export interface Change {
  kind: ChangeKind;
  text: string;
}

export interface ChangelogDay {
  /** DD-MM-YYYY */
  date: string;
  changes: Change[];
}

export interface Changelog {
  /** Newest day first. */
  days: ChangelogDay[];
  /** DD-MM-YYYY the game went online; changes from before then aren't listed. */
  online: string;
}

/** The commit types players see. `rules` is this repo's type for a change of rules or defaults. */
const KINDS: Readonly<Record<string, ChangeKind>> = { feat: 'new', rules: 'rules', fix: 'fix', perf: 'perf' };
const SUBJECT = /^(\w+)(?:\([^)]*\))?!?: (.+)$/;
export const KIND_LABEL: Readonly<Record<ChangeKind, string>> = { new: 'New', rules: 'Rules', fix: 'Fixed', perf: 'Faster' };

/** YYYY-MM-DD to DD-MM-YYYY. */
export const dmy = (iso: string): string => iso.split('-').reverse().join('-');
/** DD-MM-YYYY to a sortable YYYY-MM-DD. */
const ymd = (date: string): string => date.split('-').reverse().join('-');

/** `git log --format=%H%x1f%cd%x1f%s --date=short` output, newest first, to the player-facing changes by day. */
export function parseLog(raw: string): ChangelogDay[] {
  const byDay = new Map<string, Change[]>();
  for (const line of raw.split('\n')) {
    const [hash, iso, subject] = line.split('\x1f');
    const m = hash && iso && subject ? SUBJECT.exec(subject) : null;
    const kind = m ? KINDS[m[1]!] : undefined;
    if (!m || !kind) continue;
    const text = m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1);
    byDay.set(iso!, [...(byDay.get(iso!) ?? []), { kind, text }]);
  }
  return [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([iso, changes]) => ({ date: dmy(iso), changes }));
}

/** New changes go on top; a day already in the changelog gets them before its existing lines. */
export function mergeDays(existing: ChangelogDay[], fresh: ChangelogDay[]): ChangelogDay[] {
  const byDay = new Map<string, Change[]>();
  for (const day of [...fresh, ...existing]) byDay.set(day.date, [...(byDay.get(day.date) ?? []), ...day.changes]);
  return [...byDay.entries()].sort(([a], [b]) => ymd(b).localeCompare(ymd(a))).map(([date, changes]) => ({ date, changes }));
}

const MARKER = /<!-- changelog: up to ([0-9a-f]+) -->/;
const DAY = /^## (\d{2}-\d{2}-\d{4})\s*$/;
const LINE = new RegExp(`^- \\*\\*(${Object.values(KIND_LABEL).join('|')}):\\*\\* (.+)$`);
const ONLINE = /^Hexdice went online on (\d{2}-\d{2}-\d{4})\.$/m;

/** The last commit CHANGELOG.md covers, or null before it was first generated. */
export function changelogMarker(md: string): string | null {
  return MARKER.exec(md)?.[1] ?? null;
}

export function renderChangelog(log: Changelog, upTo: string): string {
  const days = log.days.map((d) => `## ${d.date}\n\n${d.changes.map((c) => `- **${KIND_LABEL[c.kind]}:** ${c.text}\n`).join('')}`);
  return [
    '# Changelog\n',
    'What changed in Hexdice, newest first. Players see this under What\'s new on the title screen.\n',
    '`npm run changelog` adds new `feat`, `rules`, `fix` and `perf` commits on top. Edit the wording freely, but keep the shape: `## DD-MM-YYYY`, then `- **New:**`, `**Rules:**`, `**Fixed:**` or `**Faster:**` lines.\n',
    `<!-- changelog: up to ${upTo} -->\n`,
    ...days,
    `Hexdice went online on ${log.online}.\n`,
  ].join('\n');
}

export function parseChangelog(md: string): Changelog {
  const days: ChangelogDay[] = [];
  for (const line of md.split('\n')) {
    const day = DAY.exec(line);
    if (day) days.push({ date: day[1]!, changes: [] });
    const change = LINE.exec(line);
    const kind = change ? (Object.keys(KIND_LABEL) as ChangeKind[]).find((k) => KIND_LABEL[k] === change[1]) : undefined;
    if (change && kind && days.length > 0) days.at(-1)!.changes.push({ kind, text: change[2]! });
  }
  return { days: days.filter((d) => d.changes.length > 0), online: ONLINE.exec(md)?.[1] ?? '' };
}

/** The newest change as a stable key, for remembering what a player has seen. */
export function newestChange(log: Changelog): string | null {
  const day = log.days[0];
  return day?.changes[0] ? `${day.date} ${day.changes[0].text}` : null;
}

/** True when the newest change isn't the one the player saw last. */
export function hasUnseen(log: Changelog, seen: string | null): boolean {
  const newest = newestChange(log);
  return newest !== null && newest !== seen;
}
