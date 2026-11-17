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

/** Speaker icon button: aria-pressed says on or off, so the label stays "Sound". */
export function soundToggle(): SoundToggle {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-quiet btn-icon sound-toggle';
  b.dataset.testid = 'sound';
  b.setAttribute('aria-label', 'Sound');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'sound-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.append(
    stroke('M3.5 9.5h3.5l4.5-4v13l-4.5-4H3.5z', 'sound-speaker'),
    stroke('M15 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8', 'sound-waves'),
    stroke('M15.5 9.5l5 5M20.5 9.5l-5 5', 'sound-cross'),
  );
  b.append(svg);
  return {
    el: b,
    set(on: boolean): void {
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'Sound on' : 'Sound off';
    },
  };
}
