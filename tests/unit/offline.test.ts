import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildId, precacheList, serviceWorkerSource } from '../../scripts/offline';

const file = (path: string, text: string) => ({ path, bytes: new TextEncoder().encode(text) });

describe('precacheList', () => {
  it('keeps what the game loads and drops what only matters online', () => {
    expect(precacheList(['sw.js', 'index.html', 'og-image.png', 'assets/index-a.js', 'assets/index-a.js.map', 'favicon.ico'])).toEqual([
      'assets/index-a.js',
      'favicon.ico',
      'index.html',
    ]);
  });

  it('leaves the music to be kept as it plays', () => {
    expect(precacheList(['index.html', 'music/bards-tale.m4a', 'music/victory.m4a'])).toEqual(['index.html']);
  });
});

describe('buildId', () => {
  const build = [file('index.html', '<html>'), file('assets/index-a.js', 'one')];

  it('is the same for the same files, in any order', () => {
    expect(buildId(build)).toBe(buildId([...build].reverse()));
  });

  it('changes when any file changes', () => {
    expect(buildId([build[0]!, file('assets/index-a.js', 'two')])).not.toBe(buildId(build));
    expect(buildId([build[0]!, file('assets/index-b.js', 'one')])).not.toBe(buildId(build));
  });
});

describe('serviceWorkerSource', () => {
  it('gives the template its cache name and file list, and stays valid JavaScript', () => {
    const template = readFileSync('src/offline/service-worker.js', 'utf8');
    const source = serviceWorkerSource(template, 'abc123', ['index.html', 'assets/index-a.js']);
    expect(source.startsWith('const CACHE = "hexdice-abc123";\nconst FILES = ["index.html","assets/index-a.js"];\n')).toBe(true);
    expect(() => new Function(source)).not.toThrow();
  });
});
