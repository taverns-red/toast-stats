# videos — 30-second how-to clips (#2293)

Short, silent how-to videos for Toastmasters role holders. Playwright records
a scripted walkthrough of the live site, and Remotion composes it with a title
card, timed captions, a spotlight on each step's element, a closing card and a
quiet music bed. There is no narration; the captions carry the message.

Rendering is **opt-in**. Nothing here runs in `npm run test`, the pre-push
hook or CI, apart from the unit tests for the scenario configs.

## Commands

```bash
npm run videos:build -- v2                   # desktop 16:9 → videos/out/v2.mp4
npm run videos:build -- v2 --format mobile   # phone 9:16 → videos/out/v2-mobile.mp4
npm run videos:capture -- v2 [--format mobile]   # record only → videos/public/captures/
npm run videos:render -- v2 [--format mobile]    # compose only → videos/out/
npm run test --workspace=@taverns-red/videos   # scenario timing tests
```

After a UI change, `npm run videos:build -- <scenario> [--format mobile]` is
the only command needed. Desktop is the default format. Everything it writes is gitignored. You need `ffmpeg` and `ffprobe`
on `PATH`; Playwright's Chromium (`npx playwright install chromium`) does the
capture, and Remotion downloads its own headless shell on the first render.

## Scenarios

Each scenario is one file in `src/scenarios/` (V2: `v2.ts`). It sets the
pinned URL (`?date=` keeps retakes identical) and, for each beat, the start
and end time and the caption — shared by every form factor. Under
`forms.desktop` and `forms.mobile` it sets the device, the setup steps, and
each beat's scripted steps and highlight selector, because the phone UI
(stacked rows, bottom nav) differs from desktop. The validator requires each
form to script every beat. The tests in `src/scenarios/__tests__/timing.test.ts` require
every beat to fall inside the duration, beats to be contiguous and at least
3 s long, captions to be 12 words or fewer, and the clip to be 34 s or less.

Storyboards and the role research are in
`.routine-tmp/video-scenarios-2026-10-25.md`.

## Look

- **Desktop:** 1920×1080 at 30 fps. The 1280×800 capture sits in a panel at
  1.05×, with 64 px semibold Inter captions underneath, which still reads at
  about 13 pt on a phone.
- **Mobile:** 1080×1920 (9:16). The 390×844 @3× phone capture is shown at
  ~2.56× (16 px phone text ≈ 41 px) through a window that pans per beat to
  the highlighted element (`src/layout.ts`), with 70 px captions below.
- Capture takes device-pixel screenshots back to back (~20 fps at 3×) rather
  than Playwright's video recorder, which records at CSS pixels and blurs
  once zoomed.
- Legacy palette only, until Phase 2 (#2080): `--tm-loyal-blue` for cards and
  highlights, and `--ink*`, `--surface*` and `--line` for text and neutrals.
  `src/theme.ts` copies the values, and a test fails if they drift from
  `frontend/src/styles/tokens/` or pick up `--rt-stats` or amber.
- Fonts are the app's own self-hosted Inter and Montserrat files. They are
  copied from `frontend/src/assets/fonts/` at render time.
- Captures run in a fresh light-theme browser context, so no "your district"
  star or dark mode leaks in.

## Music and licences

**Background track.** The default track, `music/calm-pad.wav`, is
**original**. `src/render/music.ts` synthesizes it with ffmpeg `aevalsrc`
from sine partials: a slow Cmaj7, Am7, Fmaj7, G progression with crossfades,
a low-pass filter and a short echo. It is normalised to −26 LUFS, and the
video fades it in and out. It contains no samples or third-party recordings,
so it needs no licence.

**Swapping in a licensed track.** Put the file in `videos/public/music/`,
record its licence here, and change the one line in
`src/scenarios/music.ts` (`DEFAULT_MUSIC`).

**Remotion licence.** Remotion is source-available, not MIT. Its free licence
covers individuals, for-profit organisations with **up to 3 employees**, and
non-profits (Remotion `LICENSE.md`, v4.0.535). A larger company needs a paid
Company License from remotion.pro.
