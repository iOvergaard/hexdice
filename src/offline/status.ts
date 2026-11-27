/** Whether this browser holds a complete copy of the game: 'none' where there is no service worker (dev, tests, old browsers). */
export type OfflineStatus = 'none' | 'saving' | 'ready';

interface RegistrationLike {
  active: unknown;
  installing: unknown;
  waiting: unknown;
}

/** An active worker finished caching every file before it activated, so its cache is complete. */
export function statusOf(registration: RegistrationLike | undefined): OfflineStatus {
  if (!registration) return 'none';
  if (registration.active) return 'ready';
  return registration.installing || registration.waiting ? 'saving' : 'none';
}

export function offlineLabel(status: OfflineStatus): string {
  return status === 'ready' ? 'Ready to play offline' : status === 'saving' ? 'Saving for offline play…' : '';
}

let current: OfflineStatus = 'none';
const listeners = new Set<(status: OfflineStatus) => void>();

export function offlineStatus(): OfflineStatus {
  return current;
}

export function setOfflineStatus(status: OfflineStatus): void {
  if (status === current) return;
  current = status;
  for (const listener of [...listeners]) listener(status);
}

/** Returns the unsubscribe function. */
export function onOfflineStatus(listener: (status: OfflineStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
