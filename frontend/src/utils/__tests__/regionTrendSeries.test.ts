/**
 * regionTrendSeries (#2127) — one region's sparkline values from the
 * program-year membership series, bounded by the page's pinned date (R3).
 * Fixture: the builder's output over the prod 2026-27 district series.
 */
import { describe, it, expect } from 'vitest'
import type { RegionMembershipSeries } from '@taverns-red/shared-contracts'
import { regionTrendSeries } from '../regionTrendSeries'
import recorded from '../../__tests__/fixtures/region-membership-series-2026-2027.recorded.json'

const SERIES = recorded as RegionMembershipSeries

describe('regionTrendSeries (#2127)', () => {
  it('reads every point of the region for the latest date', () => {
    const values = regionTrendSeries(SERIES, '05', undefined)
    expect(values).toEqual(SERIES.regions!['05']!.membership)
    expect(values).toHaveLength(SERIES.dates.length)
  })

  it('never shows a point collected after the pinned date', () => {
    const pinned = SERIES.dates[9]!
    const values = regionTrendSeries(SERIES, '05', pinned)
    expect(values).toHaveLength(10)
    expect(values).toEqual(SERIES.regions!['05']!.membership.slice(0, 10))
  })

  it('drops an uncounted (null) date rather than drawing it as 0', () => {
    const gapped = structuredClone(SERIES)
    gapped.regions!['05']!.membership[1] = null
    const values = regionTrendSeries(gapped, '05', undefined)!
    expect(values).toHaveLength(SERIES.dates.length - 1)
    expect(values).not.toContain(0)
  })

  it('is null for a region the file does not hold, or a file without regions', () => {
    expect(regionTrendSeries(SERIES, '99', undefined)).toBeNull()
    expect(
      regionTrendSeries({ ...SERIES, regions: null }, '05', undefined)
    ).toBeNull()
  })
})
