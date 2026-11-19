export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A heading over a bulleted list. */
export function listSection(heading: string, items: Array<string | Node>): HTMLElement {
  const section = el('section', 'help-section');
  const list = el('ul');
  for (const item of items) {
    const li = el('li');
    li.append(item);
    list.append(li);
  }
  section.append(el('h3', undefined, heading), list);
  return section;
}

/**
 * Opens a modal panel (How to play, What's new); Escape, the backdrop, Close and Got it all close it.
 * `name` prefixes its test ids: `<name>-dialog`, `<name>-close`, `<name>-done`.
 */
export function openPanel(name: string, heading: string, body: Node[], cls?: string): HTMLDialogElement {
  const open = document.querySelector<HTMLDialogElement>('dialog.help[open]');
  if (open) return open;

  const dialog = el('dialog', cls ? `help ${cls}` : 'help');
  dialog.dataset.testid = `${name}-dialog`;
  dialog.setAttribute('aria-labelledby', `${name}-heading`);

  const head = el('div', 'help-head');
  const title = el('h2', 'help-heading', heading);
  title.id = `${name}-heading`;
  const close = el('button', 'btn btn-quiet btn-icon help-close', '×');
  close.type = 'button';
  close.dataset.testid = `${name}-close`;
  close.setAttribute('aria-label', 'Close');
  head.append(title, close);

  const content = el('div', 'help-body');
  content.append(...body);

  const done = el('button', 'btn btn-primary', 'Got it');
  done.type = 'button';
  done.dataset.testid = `${name}-done`;
  const foot = el('div', 'help-foot');
  foot.append(done);

  dialog.append(head, content, foot);
  close.addEventListener('click', () => dialog.close());
  done.addEventListener('click', () => dialog.close());
  // The dialog's own box is covered by its children, so a click on the dialog itself is on the backdrop.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
