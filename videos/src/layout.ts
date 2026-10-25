import type { CapturedBeat, FormFactor } from './scenarios/types'

export interface Layout {
  width: number
  height: number
  /** CSS px of the capture → output px. */
  scale: number
  panel: { x: number; y: number; w: number; h: number }
  caption: { x: number; y: number; w: number; h: number; fontPx: number }
}

export const LAYOUTS: Record<FormFactor, Layout> = {
  desktop: {
    width: 0,
    height: 0,
    scale: 1,
    panel: { x: 0, y: 0, w: 0, h: 0 },
    caption: { x: 0, y: 0, w: 0, h: 0, fontPx: 0 },
  },
  mobile: {
    width: 0,
    height: 0,
    scale: 1,
    panel: { x: 0, y: 0, w: 0, h: 0 },
    caption: { x: 0, y: 0, w: 0, h: 0, fontPx: 0 },
  },
}

export function cropOffset(
  _box: CapturedBeat['box'],
  _viewportH: number,
  _windowH: number
): number {
  return -1
}
