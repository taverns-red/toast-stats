# videos — 30-second how-to clips (#2293)

Short, silent how-to videos for Toastmasters role holders. Playwright records
a scripted walkthrough of the live site, and Remotion composes it with a title
card, timed captions, a spotlight on each step's element, a closing card and a
quiet music bed. There is no narration; the captions carry the message.

Rendering is **opt-in**. Nothing here runs in `npm run test`, the pre-push
hook or main CI, apart from the unit tests for the scenario configs.

## Renders are build outputs

Rendered videos are **never committed** — not to the source tree and not to
`.pr-assets` on a PR branch.

- **Locally** they land in `videos/out/` (gitignored).
- **In CI** the opt-in [`Videos` workflow](../.github/workflows/videos.yml)
  renders them on a runner and uploads the MP4s as an Actions artifact, kept
  30 days. It runs on manual dispatch (pick the scenario and
  desktop / mobile / both) and on PRs that change `videos/**`. A PR renders
  every scenario file it adds or changes (v2 if none), both formats, one
  matrix leg and one artifact per scenario, and a sticky comment links them
  all. It holds no cloud credentials.
- **Publishing** a reviewed render to our CDN is a separate, manual workflow;
  see [Publishing to the CDN](#publishing-to-the-cdn). Nothing in the render
  workflow publishes.

## Publishing to the CDN

[`Videos publish (manual)`](../.github/workflows/videos-publish.yml) (#2310)
copies a reviewed render from its Actions artifact to
`videos/<scenario>/<version>/<scenario>-desktop.mp4` and `-mobile.mp4`,
served at `https://cdn.taverns.red/videos/…` (prod) and
`https://cdn-staging.taverns.red/videos/…` (PR previews). It uses the data
buckets the CDN already serves, so it needs no new infrastructure.

**Every publish needs Ron's approval for that publish.** The approval names
the source run id and the version label. One approval covers one dispatch.

1. Render and review: a `Videos` run (a PR's or a manual dispatch) uploads
   the artifact `videos-<scenario>-<run id>`.
2. Dispatch `Videos publish (manual)` with `run_id`, `scenario` and a new
   `version` (e.g. `2026-10-26`), leaving `dry_run` ticked. The dry run
   checks that the source is a successful `videos.yml` run, downloads the
   artifact, ffprobes it (h264/yuv420p/bt709 + AAC), checks that no object
   exists at the target, and lists the URLs it would write.
3. With the approval, dispatch again with `dry_run` unticked. It uploads to
   staging, copies that object to prod server side, and verifies the size,
   MD5, headers and a `206` range response from `cdn.taverns.red`.

Rules, enforced by `scripts/lib/__tests__/videoPublish*.test.ts`:

- The destination is only ever `videos/…`. Promotion, the content gates,
  prune and the GCS lifecycle rules never touch it.
- Objects are immutable (`--no-clobber`, and an existing object fails the
  run). A new render gets a new version label, and a page switches to it by
  changing its URL. Headers are `video/mp4` and
  `public, max-age=31536000, immutable, no-transform`.
- Deleting a published video is a manual `gcloud storage rm` and needs its
  own approval.

## Commands

```bash
npm run videos:build -- v2                   # desktop 16:9 → videos/out/v2.mp4
npm run videos:build -- v2 --format mobile   # phone 9:16 → videos/out/v2-mobile.mp4
npm run videos:capture -- v2 [--format mobile]   # record only → videos/public/captures/
npm run videos:render -- v2 [--format mobile]    # compose only → videos/out/
npm run videos:verify -- videos/out/*.mp4        # ffprobe: h264/yuv420p, bt709, AAC
npm run test --workspace=@taverns-red/videos   # scenario timing tests
```

After a UI change, `npm run videos:build -- <scenario> [--format mobile]` is
the only command needed. Desktop is the default format. Everything it writes is gitignored. You need `ffmpeg` and `ffprobe`
on `PATH`; Playwright's Chromium (`npx playwright install chromium`) does the
capture, and Remotion downloads its own headless shell on the first render.

## Scenarios

Each scenario is one file in `src/scenarios/`: V1 (`v1.ts`, District
Director), V2 (`v2.ts`, Area Director), V3 (`v3.ts`, PQD / Area Director /
Club President), V4 (`v4.ts`, club officers), V5 (`v5.ts`, Club Growth
Director), V6 (`v6.ts`, Division / Area Director), V7 (`v7.ts`, PQD), V8
(`v8.ts`, District Director), V9 (`v9.ts`, District Director / CGD / IPDD),
V10 (`v10.ts`, District Director / Alignment Committee), V12 (`v12.ts`, Region
Advisor), V14 (`v14.ts`, CGD / Division Director) and V15 (`v15.ts`, PQD /
Area Director). It sets the
pinned URL (`?date=` keeps retakes identical) and, for each beat, the start
and end time and the caption — shared by every form factor. Under
`forms.desktop` and `forms.mobile` it sets the device, the setup steps, and
each beat's scripted steps and highlight selector, because the phone UI
(stacked rows, bottom nav) differs from desktop. The validator requires each
form to script every beat. The tests in `src/scenarios/__tests__/timing.test.ts` require
every beat to fall inside the duration, beats to be contiguous and at least
3 s long, captions to be 12 words or fewer, and the clip to be 34 s or less.
A caption may not quote a count or a share (two or more digits, or a `%`):
those drift with every snapshot, so captions say what is shown. Steps are
`click`, `select`, `scrollTo`, `type` (typed key by key, so it reads),
`press`, `download` and `pause`.

The last storyboard batch (#2367) adds V11 (`v11.ts`, Club Growth Director /
VP Membership / PQD), V13 (`v13.ts`, District PR Manager / VP Public
Relations) and V16 (`v16.ts`, Webmaster / District PR Manager). The capture
grants the page clipboard access, so a "Copy link" step shows the site's
"Link copied" confirmation.

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
- **Privacy:** every capture hides club street addresses and the website and
  contact links (`src/scenarios/privacy.ts`), and refuses to record if the
  mask is not on the page. A test fails if the app renames what it keys on.

## Music and licences

**Background track.** Every track is **original** and generated at render
time (#2336). `src/music/` writes a score and synthesises it in TypeScript:
no samples, loops or third-party recordings, so it needs no licence. Each
variant is an I–V–vi–IV loop in a major key with short plucked, mallet or
strummed notes, a soft kick and a filtered-noise shaker:

| Variant               | Tempo   | Key     | Sound                                                |
| --------------------- | ------- | ------- | ---------------------------------------------------- |
| `bright-pluck`        | 112 BPM | C major | Plucked-string eighth-note arpeggio, kick on 1 and 3 |
| `light-pop` (default) | 120 BPM | G major | Mallet riff, bass eighths, four-on-the-floor kick    |
| `warm-strum`          | 100 BPM | D major | Acoustic-style strummed chords, kick on 1 and 3      |

The mix is set to −26 LUFS with one gain (true peak at most −3 dBTP), and the
video fades it in and out. Tracks are 36 s, longer than any allowed clip.

- Listen: `npm run videos:music -- [variant…] [--seconds 20]` writes AAC
  previews to `videos/out/music/`. The PR render uploads them too.
- Pick per render: `npm run videos:render -- v2 --music bright-pluck`.
- Pick per scenario: `music: trackPath('warm-strum')`. The default lives in
  `src/scenarios/music.ts` (`DEFAULT_MUSIC`).
- Tests: `npm test` covers the score and synthesis. `npm run test:audio`
  needs ffmpeg and checks length, loudness, true peak and determinism of
  the written files. videos.yml runs it.

**Swapping in a licensed track.** Put the file in `videos/public/music/`,
record its licence here, and point the scenario's `music` at it.

**Remotion licence.** Remotion is source-available, not MIT. Its free licence
covers individuals, for-profit organisations with **up to 3 employees**, and
non-profits (Remotion `LICENSE.md`, v4.0.535). A larger company needs a paid
Company License from remotion.pro.
