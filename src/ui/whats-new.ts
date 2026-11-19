import { currentVersion, KIND_LABEL } from '../changelog';
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

/** The player-facing changes by day, newest first, under the version being played, as a modal panel. */
export function openWhatsNew(log: Changelog): HTMLDialogElement {
  const version = currentVersion(log);
  const days = log.days.map((day) =>
    listSection(
      day.date,
      day.changes.map((c) => {
        const line = el('span');
        if (c.hash) line.append(commitLink(c.hash, c.hash === version ? 'change-hash is-current' : 'change-hash'));
        line.append(el('span', `change-tag is-${c.kind}`, KIND_LABEL[c.kind]), c.text);
        return line;
      }),
    ),
  );
  const body: Node[] = [...days, el('p', 'help-note', `Hexdice went online on ${log.online}.`)];
  if (version) {
    // The version is the newest change's hash, so it matches the line right below it.
    const playing = el('p', 'help-note whats-new-build', "You're on version ");
    const link = commitLink(version, 'change-hash');
    link.dataset.testid = 'version';
    playing.append(link, ', the newest change below.');
    body.unshift(playing);
  }
  return openPanel('whats-new', "What's new", body, 'whats-new');
}
