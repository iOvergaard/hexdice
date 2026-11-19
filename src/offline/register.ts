/** Offline play. Production builds only, so dev servers and tests never meet a cached build. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Ignore: the game still works online.
    });
  });
}
