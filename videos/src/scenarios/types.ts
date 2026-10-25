/**
 * Scenario model for the how-to video pipeline (#2293).
 *
 * One scenario = one ~30 s clip: a title card, timed beats over a live-site
 * capture, and a closing card. The same object drives both halves of the
 * pipeline, so the timing the composer shows is the timing the capture held:
 *
 *   - `src/cli/capture.ts` replays each beat's `steps` on the live site with
 *     Playwright, holding every beat for exactly its on-screen length, and
 *     writes a manifest of where each beat starts in the recording plus the
 *     box of the element it points at;
 *   - `src/remotion/HowToVideo.tsx` lays the title card, the beat segments,
 *     captions, highlights and the closing card on that timeline.
 *
 * All times are seconds on the final video's timeline.
 */

/** One scripted browser action. Selectors are Playwright selectors. */
export type CaptureStep =
  | { kind: 'click'; selector: string }
  | { kind: 'select'; selector: string; value: string }
  /** Smooth-scroll so the element's top sits `offsetTop` px below the viewport top. */
  | { kind: 'scrollTo'; selector: string; offsetTop: number }
  /** Click something that starts a file download and wait for it. */
  | { kind: 'download'; selector: string }
  | { kind: 'pause'; ms: number }

export interface TimedCard {
  startSec: number
  endSec: number
  caption: string
  /** Optional second line under a card's caption (e.g. how to read a URL). */
  hint?: string
}

export interface Beat extends TimedCard {
  id: string
  /** Element the beat points at; its box is recorded once the steps settle. */
  highlight?: string
  steps: CaptureStep[]
}

export interface Scenario {
  id: string
  /** Who the clip is for, shown above the title (e.g. "Area Director"). */
  role: string
  /** Live-site URL, pinned with `?date=` so retakes match. */
  url: string
  viewport: { width: number; height: number }
  fps: number
  durationSec: number
  /** Element that proves the data has loaded before recording starts. */
  readySelector: string
  /** Steps run before beat 1 to put the page in its opening state. */
  setup: CaptureStep[]
  titleCard: TimedCard
  beats: Beat[]
  closing: TimedCard
  /** Background track, relative to `videos/public/`. */
  music: string
}

/** Written by the capture CLI next to the recording. */
export interface CaptureManifest {
  scenarioId: string
  capturedAt: string
  url: string
  viewport: { width: number; height: number }
  /** Recording file, relative to `videos/public/`. */
  video: string
  beats: CapturedBeat[]
}

export interface CapturedBeat {
  id: string
  /** Where the beat starts inside the recording. */
  videoStartSec: number
  /** Seconds after the beat starts at which its highlight box is valid. */
  highlightAtSec: number
  /** Viewport-pixel box of the highlighted element, if any. */
  box: { x: number; y: number; width: number; height: number } | null
}
