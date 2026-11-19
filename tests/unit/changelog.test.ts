import { describe, expect, it } from 'vitest';
import { changelogMarker, hasUnseen, mergeDays, newestChange, parseChangelog, parseLog, renderChangelog } from '../../src/changelog';
import type { Changelog } from '../../src/changelog';

const log = (...lines: Array<[string, string, string]>) => lines.map((l) => l.join('\x1f')).join('\n') + '\n';

describe('changelog from git', () => {
  it('keeps the player-facing types, without type or scope, capitalised', () => {
    const days = parseLog(
      log(
        ['c3', '2026-11-18', 'feat(engine): last stand for the smaller of the last two players'],
        ['c2', '2026-11-18', 'rules: catch-up connection bonus on by default'],
        ['c1', '2026-11-18', 'fix(ui,game)!: owner colours you can tell apart'],
        ['c0', '2026-11-18', 'perf: faster map generation'],
      ),
    );
    expect(days).toEqual([
      {
        date: '18-11-2026',
        changes: [
          { kind: 'new', text: 'Last stand for the smaller of the last two players' },
          { kind: 'rules', text: 'Catch-up connection bonus on by default' },
          { kind: 'fix', text: 'Owner colours you can tell apart' },
          { kind: 'perf', text: 'Faster map generation' },
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

  it('groups by day, newest day first, even when commit dates arrive out of order', () => {
    const days = parseLog(log(['n2', '2026-11-18', 'feat: two'], ['o1', '2026-11-17', 'fix: one'], ['n1', '2026-11-18', 'feat: three']));
    expect(days.map((d) => [d.date, d.changes.map((c) => c.text)])).toEqual([
      ['18-11-2026', ['Two', 'Three']],
      ['17-11-2026', ['One']],
    ]);
  });
});

describe('CHANGELOG.md', () => {
  const sample: Changelog = {
    online: '17-11-2026',
    days: [
      { date: '18-11-2026', changes: [{ kind: 'new', text: 'Last stand' }, { kind: 'rules', text: 'Catch-up on by default' }] },
      { date: '17-11-2026', changes: [{ kind: 'fix', text: 'Colours you can tell apart' }, { kind: 'perf', text: 'Faster maps' }] },
    ],
  };

  it('reads back what it writes, and records the last commit it covers', () => {
    const md = renderChangelog(sample, 'abc123');
    expect(md).toContain('## 18-11-2026\n\n- **New:** Last stand\n- **Rules:** Catch-up on by default\n');
    expect(md).toContain('- **Fixed:** Colours you can tell apart\n- **Faster:** Faster maps\n');
    expect(md).toContain('Hexdice went online on 17-11-2026.');
    expect(parseChangelog(md)).toEqual(sample);
    expect(changelogMarker(md)).toBe('abc123');
  });

  it('keeps hand-edited wording and adds new changes on top, joining a day already there', () => {
    const edited = renderChangelog(sample, 'abc123').replace('Last stand', 'A last stand for the underdog');
    const merged = mergeDays(parseChangelog(edited).days, [
      { date: '19-11-2026', changes: [{ kind: 'new', text: "What's new" }] },
      { date: '18-11-2026', changes: [{ kind: 'fix', text: 'Late fix' }] },
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

  it('flags changes the player has not seen yet', () => {
    const newest = newestChange(sample)!;
    expect(newest).toBe('18-11-2026 Last stand');
    expect(hasUnseen(sample, null)).toBe(true);
    expect(hasUnseen(sample, '17-11-2026 Faster maps')).toBe(true);
    expect(hasUnseen(sample, newest)).toBe(false);
    expect(hasUnseen({ online: '17-11-2026', days: [] }, null)).toBe(false);
  });
});
