import { describe, expect, it } from 'vitest';
import { changelogMarker, currentVersion, forPlayers, hasUnseen, mergeDays, newestChange, parseChangelog, parseLog, renderChangelog } from '../../src/changelog';
import type { Changelog } from '../../src/changelog';

const log = (...lines: Array<[string, string, string]>) => lines.map((l) => l.join('\x1f')).join('\n') + '\n';

describe('changelog from git', () => {
  it('keeps the player-facing types, without type or scope, capitalised', () => {
    const days = parseLog(
      log(
        ['deb5154aaaa', '2026-11-18 13:54', 'feat(engine): last stand for the smaller of the last two players'],
        ['1962b1dbbbb', '2026-11-18 10:30', 'rules: catch-up connection bonus on by default'],
        ['17aa2c0cccc', '2026-11-18 10:30', 'fix(ui,game)!: owner colours you can tell apart'],
        ['9f00e12dddd', '2026-11-18 09:07', 'perf: faster map generation'],
      ),
    );
    expect(days).toEqual([
      {
        date: '18-11-2026',
        changes: [
          { hash: 'deb5154', kind: 'new', text: 'Last stand for the smaller of the last two players' },
          { hash: '1962b1d', kind: 'rules', text: 'Catch-up connection bonus on by default' },
          { hash: '17aa2c0', kind: 'fix', text: 'Owner colours you can tell apart' },
          { hash: '9f00e12', kind: 'perf', text: 'Faster map generation' },
        ],
      },
    ]);
  });

  it('leaves out docs, chores, tests, CI, prototypes, refactors and anything not in the format', () => {
    const raw = log(
      ['a', '2026-11-18', 'docs: last stand in the rule set'],
      ['b', '2026-11-18', 'chore(playtest): sim results'],
      ['c', '2026-11-18', 'test(e2e): keyboard shortcuts'],
      ['d', '2026-11-18', 'ci: game-length gate'],
      ['e', '2026-11-18', 'proto(engine): front-line reinforcement as a setting'],
      ['f', '2026-11-18', 'refactor: tidy the controller'],
      ['g', '2026-11-18', 'Merge feat/how-to-play: how to play panel'],
      ['h', '2026-11-18', 'feat:missing space'],
    );
    expect(parseLog(raw)).toEqual([]);
  });

  it('groups by day, newest first by time, even when commits arrive out of order', () => {
    const days = parseLog(
      log(['n2', '2026-11-18 09:00', 'feat: two'], ['o1', '2026-11-17 16:00', 'fix: one'], ['n1', '2026-11-18 11:00', 'feat: three'], ['n0', '2026-11-18 09:00', 'feat: four']),
    );
    expect(days.map((d) => [d.date, d.changes.map((c) => `${c.hash} ${c.text}`)])).toEqual([
      ['18-11-2026', ['n1 Three', 'n2 Two', 'n0 Four']],
      ['17-11-2026', ['o1 One']],
    ]);
  });
});

describe('CHANGELOG.md', () => {
  const sample: Changelog = {
    online: '17-11-2026',
    days: [
      { date: '18-11-2026', changes: [{ hash: 'deb5154', kind: 'new', text: 'Last stand' }, { hash: '1962b1d', kind: 'rules', text: 'Catch-up on by default' }] },
      { date: '17-11-2026', changes: [{ hash: 'a6c26ef', kind: 'fix', text: 'Colours you can tell apart' }, { kind: 'perf', text: 'Faster maps' }] },
    ],
  };

  it('reads back what it writes, and records the last commit it covers', () => {
    const md = renderChangelog(sample, 'abc123');
    expect(md).toContain('## 18-11-2026\n\n- deb5154 **New:** Last stand\n- 1962b1d **Rules:** Catch-up on by default\n');
    // A line added by hand may leave out the hash.
    expect(md).toContain('- a6c26ef **Fixed:** Colours you can tell apart\n- **Faster:** Faster maps\n');
    expect(md).toContain('Hexdice went online on 17-11-2026.');
    expect(parseChangelog(md)).toEqual(sample);
    expect(changelogMarker(md)).toBe('abc123');
  });

  it('keeps hand-edited wording and adds new changes on top, joining a day already there', () => {
    const edited = renderChangelog(sample, 'abc123').replace('Last stand', 'A last stand for the underdog');
    const merged = mergeDays(parseChangelog(edited).days, [
      { date: '19-11-2026', changes: [{ hash: '2d49e68', kind: 'new', text: "What's new" }] },
      { date: '18-11-2026', changes: [{ hash: 'f00ba12', kind: 'fix', text: 'Late fix' }] },
    ]);
    expect(merged.map((d) => [d.date, d.changes.map((c) => c.text)])).toEqual([
      ['19-11-2026', ["What's new"]],
      ['18-11-2026', ['Late fix', 'A last stand for the underdog', 'Catch-up on by default']],
      ['17-11-2026', ['Colours you can tell apart', 'Faster maps']],
    ]);
  });

  it('has no marker before it is first generated', () => {
    expect(changelogMarker('# Changelog\n')).toBeNull();
  });

  it('names the version by the newest change that has a hash', () => {
    expect(currentVersion(sample)).toBe('deb5154');
    const handAddedOnTop: Changelog = { ...sample, days: [{ date: '19-11-2026', changes: [{ kind: 'new', text: 'Written by hand' }] }, ...sample.days] };
    expect(currentVersion(handAddedOnTop)).toBe('deb5154');
    expect(currentVersion({ online: '17-11-2026', days: [] })).toBeNull();
  });

  it('shows players only the new features and fixes', () => {
    const rulesOnlyDay = { date: '19-11-2026', changes: [{ hash: 'c0ffee1', kind: 'rules' as const, text: 'Fairer starting dice' }] };
    const shown = forPlayers({ ...sample, days: [rulesOnlyDay, ...sample.days] });
    expect(shown.days.map((d) => [d.date, d.changes.map((c) => c.text)])).toEqual([
      ['18-11-2026', ['Last stand']],
      ['17-11-2026', ['Colours you can tell apart']],
    ]);
    expect(shown.online).toBe('17-11-2026');
    expect(currentVersion(shown)).toBe('deb5154');
    // A deploy with only a rules change doesn't light the dot.
    expect(hasUnseen(shown, '18-11-2026 Last stand')).toBe(false);
  });

  it('flags changes the player has not seen yet', () => {
    const newest = newestChange(sample)!;
    expect(newest).toBe('18-11-2026 Last stand');
    expect(hasUnseen(sample, null)).toBe(true);
    expect(hasUnseen(sample, '17-11-2026 Faster maps')).toBe(true);
    expect(hasUnseen(sample, newest)).toBe(false);
    expect(hasUnseen({ online: '17-11-2026', days: [] }, null)).toBe(false);
  });
});
