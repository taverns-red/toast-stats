/**
 * Choose every column of the region district rankings (#2702).
 *
 * Under jsdom no media query matches, so the width tier is the narrowest and
 * most columns are off by default. A test about what a column's CELL shows
 * writes the same storage the Columns menu writes, rather than clicking through
 * the menu in every test.
 */
import {
  ALWAYS_SHOWN_REGION_RANKINGS_IDS,
  REGION_RANKINGS_COLUMN_IDS,
} from '../components/regionRankingsColumnMeta'
import { writeJson } from '../utils/localStorageStore'

export const showAllRegionColumns = (): void => {
  const overrides: Record<string, boolean> = {}
  for (const id of REGION_RANKINGS_COLUMN_IDS) {
    if (!ALWAYS_SHOWN_REGION_RANKINGS_IDS.includes(id)) overrides[id] = true
  }
  writeJson('region-rankings-table:columns', { schema: 1, overrides })
}
