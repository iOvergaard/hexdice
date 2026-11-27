import type { ClientMessage, ServerMessage } from './protocol';

/** One WebSocket to a host. Works in the browser and in Node 22+, which both have WebSocket built in. */
export class Connection {
  private readonly ws: WebSocket;
  /** Resolves once connected; rejects if the host can't be reached. */
  readonly opened: Promise<void>;

  constructor(url: string, onMessage: (m: ServerMessage) => void, onClose: () => void) {
    this.ws = new WebSocket(url);
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error(`Could not reach ${url}`)), { once: true });
    });
    this.opened.catch(() => {});
    this.ws.addEventListener('message', (e) => {
      if (typeof e.data !== 'string') return;
      let m: ServerMessage;
      try {
        m = JSON.parse(e.data) as ServerMessage;
      } catch {
        return;
      }
      onMessage(m);
    });
    this.ws.addEventListener('close', () => onClose());
  }

  send(m: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close(): void {
    this.ws.close();
  }
}
