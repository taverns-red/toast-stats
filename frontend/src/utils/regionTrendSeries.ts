import type { RegionMembershipSeries } from '@taverns-red/shared-contracts'

/* regionTrendSeries (#2127) — one region's membership sparkline values from
   time-series/regions/{PY}.json, the region counterpart of
   districtTrendSeries (#1815). Bounded by the page's pinned snapshot date
   (R3) so a past date never shows points collected after it. A date where
   one of the region's districts was not counted is null in the file: it is
   left out of the line, never drawn as 0 (a dip that never happened). */

export function regionTrendSeries(
  series: RegionMembershipSeries,
  region: string,
  snapshotDate: string | undefined
): number[] | null {
  const block = series.regions?.[region]
  if (!block) return null
  const values: number[] = []
  series.dates.forEach((date, i) => {
    if (snapshotDate !== undefined && date > snapshotDate) return
    const value = block.membership[i]
    if (typeof value === 'number') values.push(value)
  })
  return values
}
