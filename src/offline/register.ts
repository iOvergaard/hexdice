import { setOfflineStatus, statusOf } from './status';

/** Offline play. Production builds only, so dev servers and tests never meet a cached build. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        const update = (): void => setOfflineStatus(statusOf(registration));
        const watch = (worker: ServiceWorker | null): void => worker?.addEventListener('statechange', update);
        update();
        watch(registration.installing);
        registration.addEventListener('updatefound', () => watch(registration.installing));
      })
      .catch(() => {
        // Ignore: the game still works online.
      });
  });
}
