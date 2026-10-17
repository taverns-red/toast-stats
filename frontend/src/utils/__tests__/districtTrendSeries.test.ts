/**
 * districtTrendSeries (#1815) — the per-district membership series behind
 * the region districts table's sparkline column, read from the district's
 * program-year time-series file. Bounded by the page's pinned snapshot date
 * (R3): a pinned past date never shows points collected after it.
 */
import { describe, it, expect } from 'vitest'
import {
  districtTrendSeries,
  describeDistrictTrend,
} from '../districtTrendSeries'

const points = [
  { date: '2026-07-26', membership: 2937 },
  { date: '2026-08-31', membership: 2900 },
  { date: '2026-09-30', membership: 2990 },
  { date: '2026-10-15', membership: 3010 },
]

describe('districtTrendSeries', () => {
  it('keeps points up to and including the snapshot date, in date order', () => {
    expect(districtTrendSeries([...points].reverse(), '2026-09-30')).toEqual([
      2937, 2900, 2990,
    ])
  })

  it('keeps every point when no date is pinned', () => {
    expect(districtTrendSeries(points, undefined)).toHaveLength(4)
  })
})

describe('describeDistrictTrend', () => {
  it('names first → last and a signed net', () => {
    expect(describeDistrictTrend([2937, 3010])).toBe(
      'Membership 2,937 → 3,010 this program year, net +73'
    )
    expect(describeDistrictTrend([3000, 2990])).toBe(
      'Membership 3,000 → 2,990 this program year, net −10'
    )
  })

  it('says when there is no series', () => {
    expect(describeDistrictTrend([])).toBe('No membership trend for this date')
  })
})
