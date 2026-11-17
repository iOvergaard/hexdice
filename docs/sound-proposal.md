# Sound: proposal

17-11-2026 · Research plus a throwaway spike on branch `claude/sound-research-fe86cf` (based on `main` at `eb118df`).

**Decided 17-11-2026** (Jacob: "sounds great"). See *Decisions* at the end. Tasks 1–4 and 6 of the plan are built on the same branch: `src/game/sound-cues.ts` (the rules), `src/game/sound.ts` (the player), `src/ui/sound-toggle.ts`, and the tests in `tests/unit/sound-cues.test.ts` and `tests/e2e/sound.spec.ts`. The text below is the proposal as written; where a decision changed it, the decision wins.

## Recommendation in short

- **Native Web Audio API, no library.** One `src/game/sound.ts` driven from the controller's event playback. That's what voxel-kart settled on after dropping Tone.js (its commit `9415d32`: "Single context means everything works on iOS. Bundle shrinks ~230KB").
- **Start with synthesised cues, then do a listening test on the dice.** The spike synthesises everything (0 KB of assets, +1.5 KB gzip of JS). If the synthesised rattle sounds cheap, swap only the dice for Kenney CC0 samples. Tonal stings (capture, your turn, win) are where synthesis is strongest anyway.
- **Sound follows the animation.** If a moment has no animation (Instant speed, "Skip to my turn"), it gets no sound. The one exception is the "your turn" chime, which plays at every speed because it's the signal that the AI round is over.
- **One mute toggle, remembered in `localStorage`, separate from motion.** No volume slider: the device volume already does that job.

## 1. Which moments get a sound

Priority: **must** = without it, sound isn't worth adding; **should** = clearly better with it; **skip** = more noise than it's worth.

| Moment | Hook in `controller.play()` | Sound (spike) | Priority |
|---|---|---|---|
| Dice tumble and land | `attackRolled`, before `roll.show()` | Bursts of filtered noise over the tumble, then a "clack" per die on landing | **must** |
| Capture | after `roll.show()` resolves, `success` | Rising two-note blip | **must** |
| Failed attack (held) | same, `!success`, sums differ | Low falling thud | **must** |
| Draw | same, equal sums | Two flat beeps. Under `drawAttrition` a draw costs less than a clear loss, so it's worth hearing the difference | should |
| Your turn starts | `turnStarted` for a living human seat | Two-tone chime, **at every speed** | **must**: it's the most *useful* sound. It tells you your turn has come while you look away during a long AI round |
| Player knocked out | `playerEliminated`, together with the burst and banner (`ELIMINATION_MS`) | A noise blast closing through a low-pass filter over a falling boom, as long as the visual (≤ 1.4 s) | **must**: pairs with the big bang |
| You win / you're out | `finishGame()` / `humansAllOut` | Rising arpeggio / falling three notes | should |
| Your reinforcement | `reinforced`, human only | Soft plinks spread over the placement animation | should |
| AI reinforcement | — | none | skip |
| UI taps (select, buttons) | — | none | skip (open question 6) |

**AI rolls are the volume problem.** At Fast with autoplay, the spike logged 89 rolls in 25 seconds (about 3.5 per second). The spike plays AI rolls at about 40% volume. **Decided:** quiet at Slow and Normal, silent from Fast.

## 2. Approach

**Native Web Audio vs a library**

| | Option | Trade-off |
|---|---|---|
| **A (recommended)** | Native Web Audio API | Nothing to install. One `AudioContext` handles both oscillators and samples, which voxel-kart found matters on iOS. About 200 lines. |
| B | [howler.js](https://github.com/goldfire/howler.js) (MIT) | Built for playing samples, with unlock helpers; its README says "As light as 7kb gzipped". It doesn't synthesise, and that's a third of today's whole bundle. |
| C | [ZzFX](https://github.com/KilledByAPixel/ZzFX) (MIT) | Tiny synthesiser ("Less than 1 kilobyte when compressed!"). A neat source of presets, but it's still a new dependency, and our cues need custom timing anyway. |

**Synthesised vs samples**

| | Option | Trade-off |
|---|---|---|
| **A (start here)** | All synthesised | 0 KB, no licences to track, a sound that's our own. Cues stretch to any duration, which matters because the tumble runs from 140 ms (AI, Fast) to 1,120 ms (you, Slow). Real-sounding dice are the hardest thing to synthesise. |
| B | All samples (Kenney CC0) | Realistic and proven in voxel-kart. ~5–15 KB per sound, and every cue needs a fade to fit the variable timings. |
| **C (if the listening test asks for it)** | Samples for the dice only, everything else synthesised | Realism where it counts, ~15–30 KB. Same API: only the `dice()` cue changes. |

**How it hooks in.** `Controller.play()` already plays events one at a time and knows the `speed`, `byAi`, `mode` and `gen`. The spike adds about 30 lines there (see the diff):

1. **Per-attack sounds follow the animation duration.** No sound when `ms === 0`. That covers Instant, "Skip to my turn"/"Skip to the end" (which run at `instant`) and the e2e runs at `speed=instant`. Nothing has to treat these cases specially.
2. **The dice are scheduled on the audio clock.** `sound.dice(ms, …)` schedules the rattle across `0.7 × ms` and the landing clack at `0.7 × ms`, matching the split in `RollView.show()` (`roll-view.ts:164`). The result sting plays once `roll.show()` resolves. Real build: export that 0.7 so the two can't drift apart.
3. **The your-turn chime ignores speed.** It plays once per round, so it can't machine-gun.
4. **Replay** (spike): no dice or results, only knockouts and the final sting, so a replay plays as a highlight reel (decided).
5. **Abandoning a game** (`toTitle`, `replay`, `load` bump `gen`) calls `sound.stopAll()`, so a roll that's still scheduled doesn't keep rattling on the title screen.
6. **Reduced motion:** there's no tumble, so only the landing clack plays. Sound is its own setting; reduced motion doesn't mute it.

**The engine stays pure.** Sound lives in `src/game`, and the engine and AI are untouched. `Math.random()` only varies the timbre and never touches game state (the same as the roll strip's face shuffle).

**Testing.** Audio output can't be asserted in CI. The spike keeps a cue log (`__hexdice.sounds()`) for e2e. In the real build, the "which events give which cues at which speed" rule becomes a pure function, unit-tested in Vitest.

## 3. Assets

Only CC0 or our own synthesis. Checked on 17-11-2026:

| Source | Licence | What's useful |
|---|---|---|
| [Kenney · Casino Audio](https://kenney.nl/assets/casino-audio) | CC0 (asset page), 50 files, v1.1 | Dice, card and chip foley: the dice-rattle candidate |
| [Kenney · Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 (asset page), 130 files | Thuds for "held" or the knockout |
| [Kenney · Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 (asset page), 100 files | Clicks and chimes, if we want UI taps |
| [Freesound](https://freesound.org/help/faq/) | Each sound is one of "Creative Commons 0", "Attribution" or "Attribution Noncommercial" (their FAQ) | Fallback. **CC0 only**; NonCommercial is out. |
| Our own synthesis | No third-party rights | The spike |

- Kenney's [support page](https://kenney.nl/support) says all assets on the asset pages are CC0 and that attribution isn't required.
- The [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/) lets anyone "copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission". So nothing needs reconciling with the repo's MPL-2.0. We should still record each file's origin in `public/sounds/CREDITS.md` (pack, version, URL, licence, date) so the provenance is visible in the public repo.
- Not checked: the `License.txt` inside the Kenney zips (I didn't download them), or the exact file names and format. If the files are OGG, convert them to MP3 (`ffmpeg`/`lame` are installed here): MDN says MP3 "is supported by all major browsers" while Ogg containers "are not universally supported" ([MDN codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)).
- I'd avoid CC-BY files unless one is a must-have. It's allowed, but it adds an attribution obligation for the life of the repo.

## 4. Practicalities

**Autoplay.** Chrome: "If an AudioContext is created before the document receives a user gesture, it will be created in the 'suspended' state, and you will need to call resume() after the user gesture" ([Chrome autoplay policy](https://developer.chrome.com/blog/autoplay)). The HTML spec lists the events that count as a gesture: `keydown` (except Esc), `mousedown`, `pointerdown` from a mouse, `pointerup` from touch or pen, and `touchend` ([HTML spec, activation-triggering input event](https://html.spec.whatwg.org/multipage/interaction.html#activation-triggering-input-event)). The board taps on `pointerup` (`board-view.ts:125`), so a tap on the board counts. The spike creates the context inside the first of those events (capture phase, on `document`). On every later gesture it calls `resume()` if the context isn't running, which also covers a context that iOS suspended during an interruption (a phone call or an app switch). Title → Start is the first gesture in normal play; a `?seed=` link starts at the first board tap.

**iOS Safari: the silent switch.** Web Audio on iOS is muted by the ringer/silent switch, while `<audio>`/`<video>` elements aren't. A WebKit engineer confirmed the default audio session type is `ambient`, and that since iOS 17 `navigator.audioSession.type = "playback"` changes that ([WebKit bug 237322](https://bugs.webkit.org/show_bug.cgi?id=237322), comment 6, 25-09-2024). I recommend keeping the default: a casual game should respect the silent switch and mix with whatever the player is listening to (decided). Not tested on a device.

**Mute toggle.**
- One toggle in the HUD and on the title screen, stored as `hexdice:sound` = `on`/`off`. It uses the same try/catch pattern as `hexdice:title` (`controller.ts:19-37`).
- Turning sound on starts the context from that click, so you hear the next roll straight away (verified).
- At 375 px, the spike's text button ("Sound on") pushes Quit onto a second row. The real build should use an icon button (a speaker and a crossed-out speaker) with `aria-pressed` and an `aria-label`.
- Add `?sound=off` to the URL parameters for tests and repro links.

**Separate from motion.** `prefers-reduced-motion` doesn't mute anything (see §2, point 6). Every sound has a visual counterpart already, so sound is never the only signal.

**File-size budget.**
- Today's build: 57.8 KB JS, 19.8 KB gzip (`vite build`, 17-11-2026). With the spike: 62.6 KB, 21.4 KB gzip, so **+1.5 KB gzip for all synthesised sound**.
- If we add samples: **≤ 60 KB of MP3 in total**, fetched and decoded after the first gesture so they're never on the first-paint path. For scale, voxel-kart's 10 Kenney MP3s add up to 56 KB (1.2–13 KB each, measured).

## 5. Plan

One PR, roughly 250–350 lines including tests:

1. **`src/game/sound.ts`** from the spike: tidy it, share the tumble ratio with `RollView`, set the levels by ear. *S*
2. **Pure `cuesFor(events, { speed, byAi, mode })`** plus Vitest cases for Instant, skip, replay, AI vs human, and the your-turn chime. *S*
3. **Controller wiring** as in the spike, with `stopAll()` wherever `gen` is bumped. *S*
4. **Icon toggle** in the HUD and on the title screen, `hexdice:sound`, and `?sound=off`. *S*
5. **Listening pass** (you), *not now: synthesised only for the time being*: synthesised dice vs Kenney Casino Audio dice. If the samples win: 2–4 MP3s in `public/sounds/` plus `CREDITS.md`, loaded with `fetch` + `decodeAudioData` after the first gesture. *S–M*
6. **Gates:**
   - `check`, plus `e2e` with one attack asserting the cue log, and mute.
   - Hands-on on desktop and on a real iPhone: silent switch on and off, an interruption from an app switch, and the toggle at phone width.
   - *S*

## Decisions (17-11-2026)

1. **Dice sound:** synthesised only. No samples for now and no `public/sounds/`.
2. **AI rolls:** quiet (about 40%) at Slow and Normal, silent at Fast. Instant and skipping are silent.
3. **Replay:** a highlight reel, with knockouts and the final sting only.
4. **iOS silent switch:** respected (the default audio session is kept).
5. **First visit:** sound on by default. It still only starts after the first tap or key press.
6. **UI taps:** none.

## How the spike was checked

(The build's own checks are in `playtest/17-11-2026-sound.md`.)

Done in the in-app browser (Chromium) at `?seed=42&players=4`, with real clicks so that the gesture counts. The cue log only records a cue when the `AudioContext` is `running`, so each entry below means the cue was scheduled on a running context.

| Scenario | Result |
|---|---|
| `npm run check` | **Verified**: 96 tests pass |
| `npm run e2e` (desktop + phone) | **Verified**: 47 passed, 1 skipped (that test only runs on the phone project) |
| First real click unlocks audio; your attack plays dice then capture | **Verified**: log `dice, capture` |
| End turn: your reinforcement plinks, AI rolls play | **Verified**: `place`, then AI `dice`/`capture` |
| "Skip to my turn": no dice while skipping, chime on arrival | **Verified**: only the roll already in flight finished (`capture`), then `yourTurn` |
| Autoplay at Fast for 25 s | **Verified**: 89 dice, 78 capture, 5 held, 5 draw |
| Knockout cue together with the big bang | **Verified**: `knockout` logged while the banner "Atlas eliminated · by Cinder · now gets +1 die per turn" was showing |
| Mute | **Verified**: 0 cues over 3 s of autoplay; `off` stored and still set after a reload |
| Unmute from the toggle's own click | **Verified**: the next attack logged `dice, capture` |
| Phone width (375 px) | **Partly verified**: it works, but the text button wraps Quit to a second row (see §4) |
| How it actually sounds | **Not testable**: I can't hear audio output. The log proves scheduling, not quality |
| iOS Safari, silent switch, interruptions | **Not testable**: no device here |
| Firefox, desktop Safari | **Not tested** |
| Reduced motion, replay, win/lose stings, "you're out" sting | **Not exercised** in this session |
