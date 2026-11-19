// Adds the player-facing commits since CHANGELOG.md was last updated, keeping its hand-edited wording.
// `npm run changelog` updates the file; `npm run changelog -- --check` fails when it is behind (CI on main).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { changelogMarker, dmy, mergeDays, parseChangelog, parseLog, renderChangelog } from '../src/changelog';

const FILE = 'CHANGELOG.md';
/** The first commit deployed to hexdice.snebold.dk; nothing before it is player news. */
const FIRST_DEPLOY = 'ce33ad5';

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' });
const md = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
const since = changelogMarker(md) ?? FIRST_DEPLOY;
const fresh = parseLog(git('log', '--no-merges', '--date=short', '--format=%H%x1f%cd%x1f%s', `${since}..HEAD`));
const count = fresh.reduce((n, d) => n + d.changes.length, 0);

if (process.argv.includes('--check')) {
  if (count > 0) {
    console.error(`${FILE} is missing ${count} player-facing change(s) since ${since.slice(0, 7)}: run \`npm run changelog\` and commit it.`);
    process.exit(1);
  }
  console.log(`${FILE} is up to date.`);
} else {
  const old = md ? parseChangelog(md) : { days: [], online: dmy(git('show', '-s', '--date=short', '--format=%cd', FIRST_DEPLOY).trim()) };
  const head = git('rev-parse', 'HEAD').trim();
  writeFileSync(FILE, renderChangelog({ days: mergeDays(old.days, fresh), online: old.online }, head));
  console.log(`${FILE}: ${count} new change(s), up to ${head.slice(0, 7)}.`);
}
