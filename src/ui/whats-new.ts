import { KIND_LABEL } from '../changelog';
import type { Changelog } from '../changelog';
import { el, listSection, openPanel } from './panel';

/** The player-facing changes by day, newest first, as a modal panel. */
export function openWhatsNew(log: Changelog): HTMLDialogElement {
  const days = log.days.map((day) =>
    listSection(
      day.date,
      day.changes.map((c) => {
        const line = el('span');
        if (c.time) line.append(el('span', 'change-time', c.time));
        line.append(el('span', `change-tag is-${c.kind}`, KIND_LABEL[c.kind]), c.text);
        return line;
      }),
    ),
  );
  return openPanel('whats-new', "What's new", [...days, el('p', 'help-note', `Hexdice went online on ${log.online}.`)], 'whats-new');
}
