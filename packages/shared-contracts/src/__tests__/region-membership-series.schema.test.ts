import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  REGION_MEMBERSHIP_SERIES_FORMAT,
  RegionMembershipSeriesSchema,
  regionMembershipSeriesPath,
  type RegionMembershipSeries,
} from '../index.js'

/**
 * #2127 — `time-series/regions/{PY}.json`, the region and world membership
 * series behind the /regions sparklines.
 *
 * The fixture is the builder's own output over recorded prod time-series
 * files (`packages/analytics-core/src/rollup/__tests__/fixtures/
 * region-membership-series/`, 2025-26), not a hand-written shape.
 */
const RECORDED = JSON.parse(
  readFileSync(
    new URL(
      './__fixtures__/recorded-region-membership-series.json',
      import.meta.url
    ),
    'utf-8'
  )
) as RegionMembershipSeries

describe('RegionMembershipSeriesSchema (#2127)', () => {
  it('parses the recorded artifact unchanged', () => {
    expect(RegionMembershipSeriesSchema.parse(RECORDED)).toEqual(RECORDED)
    expect(RECORDED._format).toEqual(REGION_MEMBERSHIP_SERIES_FORMAT)
    expect(regionMembershipSeriesPath('2025-2026')).toBe(
      'time-series/regions/2025-2026.json'
    )
  })

  it('keeps an uncounted date (null) apart from a measured value', () => {
    const values = RECORDED.regions!['05']!.membership
    expect(values.every(v => v === null)).toBe(true)
    expect(RECORDED.regions!['09']!.membership.every(v => v !== null)).toBe(
      true
    )
  })

  it('rejects a series not aligned with dates', () => {
    const bad = structuredClone(RECORDED)
    bad.regions!['09']!.membership.pop()
    expect(RegionMembershipSeriesSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a negative or fractional value', () => {
    const bad = structuredClone(RECORDED)
    bad.world.membership[0] = -1
    expect(RegionMembershipSeriesSchema.safeParse(bad).success).toBe(false)
    bad.world.membership[0] = 1.5
    expect(RegionMembershipSeriesSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an extra field: counts only, never club or person data', () => {
    const bad = structuredClone(RECORDED) as unknown as {
      regions: Record<string, Record<string, unknown>>
    }
    bad.regions['09']!.clubNames = ['A club']
    expect(RegionMembershipSeriesSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a region with no districts and an uncounted entry with no dates', () => {
    const empty = structuredClone(RECORDED)
    empty.regions!['09']!.districtIds = []
    expect(RegionMembershipSeriesSchema.safeParse(empty).success).toBe(false)
    const noDates = structuredClone(RECORDED)
    noDates.uncountedDistricts[0]!.dates = []
    expect(RegionMembershipSeriesSchema.safeParse(noDates).success).toBe(false)
  })
})
