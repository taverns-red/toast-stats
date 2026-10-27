import type { CapturedBeat, FormFactor } from './scenarios/types'

export interface Layout {
  width: number
  height: number
  /** CSS px of the capture → output px. */
  scale: number
  /** Where the capture is shown. On mobile it is a window panned per beat. */
  panel: { x: number; y: number; w: number; h: number }
  caption: { x: number; y: number; w: number; h: number; fontPx: number }
  /** Title/closing card type sizes. */
  card: { padX: number; titlePx: number; bodyPx: number; hintPx: number }
}

const DESKTOP_SCALE = 1.05
const MOBILE_SCALE = 1000 / 390

/**
 * Desktop 16:9: the 1280×800 capture at 1.05× with a caption band under it.
 * Captions are 64 px (6 % of the frame height), ~13 pt full-width on a phone.
 *
 * Mobile 9:16: the 390-wide phone capture at ~2.56× (1000 px wide), so 16 px
 * phone text is ~41 px — about 15 pt when the vertical video fills a phone.
 * The window shows ~523 CSS px of the 844 px viewport and pans per beat to
 * the highlighted element (cropOffset). Captions sit below at 70 px.
 */
export const LAYOUTS: Record<FormFactor, Layout> = {
  desktop: {
    width: 1920,
    height: 1080,
    scale: DESKTOP_SCALE,
    panel: {
      x: (1920 - 1280 * DESKTOP_SCALE) / 2,
      y: 24,
      w: 1280 * DESKTOP_SCALE,
      h: 800 * DESKTOP_SCALE,
    },
    caption: {
      x: (1920 - 1280 * DESKTOP_SCALE) / 2,
      y: 24 + 800 * DESKTOP_SCALE,
      w: 1280 * DESKTOP_SCALE,
      h: 1080 - (24 + 800 * DESKTOP_SCALE),
      fontPx: 64,
    },
    card: { padX: 160, titlePx: 96, bodyPx: 54, hintPx: 44 },
  },
  mobile: {
    width: 1080,
    height: 1920,
    scale: MOBILE_SCALE,
    panel: { x: 40, y: 56, w: 1000, h: 1340 },
    caption: { x: 40, y: 1396, w: 1000, h: 1920 - 1396 - 40, fontPx: 70 },
    card: { padX: 72, titlePx: 104, bodyPx: 52, hintPx: 46 },
  },
}

/** Margin kept above a highlight taller than the window. */
const TOP_MARGIN = 16

/**
 * Vertical pan (CSS px) for a window `windowH` tall over a viewport
 * `viewportH` tall, so the highlight is centred — or, if it is taller than
 * the window, its top is in view — without running off either end.
 */
export function cropOffset(
  box: CapturedBeat['box'],
  viewportH: number,
  windowH: number
): number {
  const maxOffset = Math.max(0, viewportH - windowH)
  if (!box || maxOffset === 0) return 0
  const wanted =
    box.height > windowH - 2 * TOP_MARGIN
      ? box.y - TOP_MARGIN
      : box.y + box.height / 2 - windowH / 2
  return Math.min(maxOffset, Math.max(0, wanted))
}

/** Stub (#2353): replaced in the next commit. */
export function cardUrlText(text: string): string {
  return text
}
