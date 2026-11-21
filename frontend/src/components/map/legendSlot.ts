const CHIP_HEIGHT = 44
const CHIP_GAP = 8
const CHIPS_PER_ROW = 2
const MAX_ROWS = 3

/** Height in px to reserve for the legend chips before they render: the
 *  side panel fits two chips a row, and the count is capped so a long legend
 *  does not reserve a screen. Pinned by mapLoadingReserve.test.ts. */
export function legendSlotHeight(categoryCount: number): number {
  const rows = Math.min(
    MAX_ROWS,
    Math.max(1, Math.ceil(categoryCount / CHIPS_PER_ROW))
  )
  return rows * CHIP_HEIGHT + (rows - 1) * CHIP_GAP
}
