const SVG_NS = 'http://www.w3.org/2000/svg';

function stroke(d: string, cls: string): SVGPathElement {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('class', cls);
  return p;
}

export interface SoundToggle {
  el: HTMLButtonElement;
  set(on: boolean): void;
}

function iconToggle(name: string, paths: SVGPathElement[]): SoundToggle {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-quiet btn-icon sound-toggle';
  b.dataset.testid = name.toLowerCase();
  b.setAttribute('aria-label', name);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'sound-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.append(...paths);
  b.append(svg);
  return {
    el: b,
    set(on: boolean): void {
      b.setAttribute('aria-pressed', String(on));
      b.title = `${name} ${on ? 'on' : 'off'}`;
    },
  };
}

/** Speaker icon button: aria-pressed says on or off, so the label stays "Sound". */
export function soundToggle(): SoundToggle {
  return iconToggle('Sound', [
    stroke('M3.5 9.5h3.5l4.5-4v13l-4.5-4H3.5z', 'sound-speaker'),
    stroke('M15 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8', 'sound-waves'),
    stroke('M15.5 9.5l5 5M20.5 9.5l-5 5', 'sound-cross'),
  ]);
}

/** Two quavers, struck through when off. */
export function musicToggle(): SoundToggle {
  return iconToggle('Music', [
    stroke('M9 17.5V6l11-2.5V15', 'music-stems'),
    stroke('M9 17.5a2.75 2.25 0 1 1-5.5 0a2.75 2.25 0 1 1 5.5 0zM20 15a2.75 2.25 0 1 1-5.5 0a2.75 2.25 0 1 1 5.5 0z', 'sound-speaker'),
    stroke('M3.5 3.5l17 17', 'sound-cross'),
  ]);
}
