import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

export interface BuiltFile {
  path: string;
  bytes: Uint8Array;
}

/** Shipped but never needed offline: the worker itself and the link-preview image. */
const ONLINE_ONLY = new Set(['sw.js', 'og-image.png']);

/** Music is off by default, so the worker keeps each track the first time it plays instead of up front. */
export function precacheList(paths: readonly string[]): string[] {
  return paths.filter((p) => !ONLINE_ONLY.has(p) && !p.endsWith('.map') && !p.startsWith('music/')).sort();
}

/** Content hash of the files: the same build gives the same id, so redeploying it updates nobody. */
export function buildId(files: readonly BuiltFile[]): string {
  const hash = createHash('sha256');
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(f.path).update('\0').update(f.bytes).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export function serviceWorkerSource(template: string, id: string, files: readonly string[]): string {
  return `const CACHE = ${JSON.stringify(`hexdice-${id}`)};\nconst FILES = ${JSON.stringify(files)};\n\n${template}`;
}

async function readBuild(dir: string): Promise<BuiltFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const paths = entries.filter((e) => e.isFile()).map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'));
  return Promise.all(precacheList(paths).map(async (path) => ({ path, bytes: await readFile(join(dir, path)) })));
}

/** Writes sw.js into production builds, listing every file the build shipped. */
export function offline(): Plugin {
  let template = '';
  return {
    name: 'hexdice-offline',
    apply: 'build',
    async configResolved(config) {
      template = await readFile(join(config.root, 'src/offline/service-worker.js'), 'utf8');
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      async handler(options) {
        const dir = options.dir!;
        const files = await readBuild(dir);
        await writeFile(join(dir, 'sw.js'), serviceWorkerSource(template, buildId(files), files.map((f) => f.path)));
      },
    },
  };
}
