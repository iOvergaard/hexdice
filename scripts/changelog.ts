// Adds the player-facing commits since CHANGELOG.md was last updated, keeping its hand-edited wording.
// `npm run changelog` updates the file; `npm run changelog -- --check` fails when it is behind (CI on main).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { changelogMarker, dmy, mergeDays, parseChangelog, parseLog, renderChangelog } from '../src/changelog';

const FILE = 'CHANGELOG.md';
/** The first commit deployed to hexdice.snebold.dk; nothing before it is player news. */
const FIRST_DEPLOY = 'ce33ad5';
const DATE = '--date=format-local:%Y-%m-%d %H:%M';

// Times in Danish time wherever this runs, so CI and laptops write the same file.
const git = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, TZ: 'Europe/Copenhagen' } });

/**
 * Every non-merge commit that reached main's first-parent line after `since`, as `hash␟landed␟subject`.
 * A branch's commits take the time of the merge that brought them in; commits `since` already covers are skipped.
 */
function landed(since: string): string {
  const lines: string[] = [];
  for (const row of git('log', '--first-parent', DATE, '--format=%H%x1f%P%x1f%cd%x1f%s', `${since}..HEAD`).split('\n')) {
    const [hash, parents, when, subject] = row.split('\x1f');
    if (!hash || !parents || !when) continue;
    const [first, ...merged] = parents.split(' ');
    if (merged.length === 0) {
      lines.push(`${hash}\x1f${when}\x1f${subject}`);
      continue;
    }
    for (const branchTip of merged) {
      for (const c of git('log', '--no-merges', '--format=%H%x1f%s', branchTip, `^${first}`, `^${since}`).split('\n')) {
        const [h, s] = c.split('\x1f');
        if (h && s) lines.push(`${h}\x1f${when}\x1f${s}`);
      }
    }
  }
  return lines.join('\n');
}

const md = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
const since = changelogMarker(md) ?? FIRST_DEPLOY;
const fresh = parseLog(landed(since));
const count = fresh.reduce((n, d) => n + d.changes.length, 0);

if (process.argv.includes('--check')) {
  if (count > 0) {
    console.error(`${FILE} is missing ${count} player-facing change(s) since ${since.slice(0, 7)}: run \`npm run changelog\` and commit it.`);
    process.exit(1);
  }
  console.log(`${FILE} is up to date.`);
} else {
  const online = () => dmy(git('show', '-s', '--date=format-local:%Y-%m-%d', '--format=%cd', FIRST_DEPLOY).trim());
  const old = md ? parseChangelog(md) : { days: [], online: online() };
  const head = git('rev-parse', 'HEAD').trim();
  writeFileSync(FILE, renderChangelog({ days: mergeDays(old.days, fresh), online: old.online }, head));
  console.log(`${FILE}: ${count} new change(s), up to ${head.slice(0, 7)}.`);
}
