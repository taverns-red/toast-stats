import type { ModeModel } from './pinModes'

const CHIP_HEIGHT = 44
const ROW_GAP = 8
const MAX_ROWS = 4
// The side panel's inner width (320px less padding and border), rounded
// down so a row is never over-counted as fitting.
const PANEL_WIDTH = 280
// A chip is its padding, swatch, gaps and a three-digit count around the
// label, which runs about 8px a character at 14px semibold. Measured: the
// default health legend is three rows tall.
const CHIP_CHROME = 84
const CHAR_WIDTH = 8

const chipWidth = (label: string) => CHIP_CHROME + CHAR_WIDTH * label.length

/** Height in px to reserve for the legend chips: the rows these labels fill
 *  in the side panel, capped so a long legend does not reserve a screen.
 *  Pinned by mapLoadingReserve.test.ts. */
export function legendSlotHeight(labels: readonly string[]): number {
  let rows = 1
  let used = 0
  for (const label of labels) {
    const w = chipWidth(label)
    if (used > 0 && used + ROW_GAP + w > PANEL_WIDTH) {
      rows++
      used = w
    } else {
      used += (used > 0 ? ROW_GAP : 0) + w
    }
  }
  const shown = Math.min(rows, MAX_ROWS)
  return shown * CHIP_HEIGHT + (shown - 1) * ROW_GAP
}

/** The chips a mode will show before any club counts are known: every
 *  category except the shared states, which legendChips hides at zero. Once
 *  the counts land the page sizes the slot from the real chips instead. */
export function estimateLegendLabels(model: ModeModel): string[] {
  return model.categories
    .filter(c => c.shape !== 'suspended' && c.shape !== 'na')
    .map(c => c.label)
}
