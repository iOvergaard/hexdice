import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

/**
 * A static host that caches like GitHub Pages: every file is fresh for ten minutes and carries an ETag.
 * Swapping `root` is a deploy: the old build's files are gone at once.
 */
export class PagesServer {
  /** Requests answered so far. */
  served = 0;
  /** Hold requests open: a signal that connects but carries nothing. */
  stalled = false;

  private constructor(
    public root: string,
    private readonly server: Server,
  ) {}

  static async start(root: string): Promise<PagesServer> {
    const server = createServer();
    const pages = new PagesServer(root, server);
    server.on('request', (req, res) => {
      if (pages.stalled) return;
      void pages.serve(req.url ?? '/', req.headers['if-none-match']).then(({ status, headers, body }) => {
        pages.served++;
        res.writeHead(status, headers).end(body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
    return pages;
  }

  get url(): string {
    return `http://localhost:${(this.server.address() as AddressInfo).port}/`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }

  private async serve(url: string, ifNoneMatch: string | undefined) {
    let path = decodeURIComponent(new URL(url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(this.root, path));
    const bytes = file.startsWith(this.root) ? await readFile(file).catch(() => null) : null;
    if (!bytes) return { status: 404, headers: { 'content-type': 'text/plain' }, body: 'Not found' };
    const etag = `"${createHash('sha1').update(bytes).digest('hex')}"`;
    const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=600', etag };
    return ifNoneMatch === etag ? { status: 304, headers, body: '' } : { status: 200, headers, body: bytes };
  }
}
