import { KIND_LABEL } from '../changelog';
import type { Changelog } from '../changelog';
import { el, listSection, openPanel } from './panel';

const COMMIT_URL = 'https://github.com/iOvergaard/hexdice/commit/';

function commitLink(hash: string, cls: string): HTMLAnchorElement {
  const a = el('a', cls, hash);
  a.href = `${COMMIT_URL}${hash}`;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** The player-facing changes by day, newest first, and the build being played, as a modal panel. */
export function openWhatsNew(log: Changelog, build: string): HTMLDialogElement {
  const days = log.days.map((day) =>
    listSection(
      day.date,
      day.changes.map((c) => {
        const line = el('span');
        if (c.hash) line.append(commitLink(c.hash, 'change-hash'));
        line.append(el('span', `change-tag is-${c.kind}`, KIND_LABEL[c.kind]), c.text);
        return line;
      }),
    ),
  );
  // On top, so the build sits right above the newest changes it can be compared with.
  const playing = el('p', 'help-note whats-new-build', "You're playing build ");
  const current = /^[0-9a-f]{7,40}$/.test(build) ? commitLink(build, 'change-hash') : el('span', undefined, build);
  current.dataset.testid = 'build';
  playing.append(current, '.');
  const online = el('p', 'help-note', `Hexdice went online on ${log.online}.`);
  return openPanel('whats-new', "What's new", [playing, ...days, online], 'whats-new');
}
