# Offline indicator on the title screen (27-11-2026)

The title screen now shows whether this browser holds a complete copy of the game, under How to play / What's new / Sound:

- "Saving for offline play…" with a hollow ring while the service worker caches the build.
- "Ready to play offline" with a green tick once a worker is active. A worker activates only after its install cached every file, so the tick means the cache is complete.
- Nothing where there is no service worker (dev server, tests, browsers without one), and nothing if the first install fails.

Shaped in #40 (round 1 and the write-up). During an update the old worker stays active with its complete cache, so the tick stays.

## Scenarios

| Scenario | Result | How |
|---|---|---|
| First visit: saving, then ready | Verified | e2e `the title says when the game is saved for offline play`, desktop and phone. The test holds the worker's request for `favicon.svg` so the saving state is on screen. ![saving](screens/offline-desktop-saving.png) ![ready](screens/offline-phone-ready.png) |
| Reload while offline: still says ready | Verified | e2e `after one visit…`. ![title offline](screens/offline-desktop-title.png) |
| Dev server: hidden | Verified | e2e `the dev server registers no service worker` |
| Phone on its side (750×342, 568×320) | Verified | e2e `on a phone on its side…`, desktop and phone: the note is visible once scrolled to, with no horizontal scroll. It runs on a production build, because the landscape specs run on the dev server, where the note never shows. ![568×320](screens/offline-phone-landscape-568x320.png) ![750×342](screens/offline-phone-landscape-750x342.png) |
| Phone upright (375×667) | Verified | Production build in a throwaway Playwright script: no horizontal scroll. ![ready](screens/offline-phone-ready.png) |
| Install fails: the note hides | Partly verified | `statusOf` unit test (no active, installing or waiting worker gives `none`). Not run in a browser: no test makes `cache.addAll` fail. |
| Screen reader announces the change | Not testable here | The note has `role="status"`, but no screen reader was run. |
| Safari / Firefox | Not testable here | e2e runs Chromium only. |

## Gates

- `npm run check`: 257 passed.
- `npm run e2e`: 156 passed, 26 skipped, before the landscape tests were added. Then `tests/e2e/offline.spec.ts` alone with them: 14 passed.
