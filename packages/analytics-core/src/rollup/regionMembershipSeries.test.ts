/**
 * Region and world membership series (#2127).
 *
 * Inputs are recorded prod time-series files (see
 * `__tests__/fixtures/region-membership-series/README.md`) and the real
 * region history the region-rollups tests use. Expected sums were read with
 * `jq` from the same fixture bytes, not from this module's output.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DistrictRegionHistorySchema,
  RegionMembershipSeriesSchema,
  type DistrictRegionHistory,
} from '@taverns-red/shared-contracts'
import {
  buildRegionMembershipSeries,
  type RegionSeriesDistrictInput,
} from './regionMembershipSeries.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, '__tests__/fixtures/region-membership-series')
const PY = '2025-2026'
const REGION_09 = ['75', '76', '80', '87', '93']
const ALL = [...REGION_09, '61', 'U']

// jq '.dataPoints[0].membership, .dataPoints[-1].membership' per file.
const FIRST: Record<string, number> = {
  '61': 2794,
  '75': 3186,
  '76': 3185,
  '80': 4881,
  '87': 1943,
  '93': 1202,
}
const LAST: Record<string, number> = {
  '61': 2892,
  '75': 3043,
  '76': 3071,
  '80': 5012,
  '87': 2261,
  '93': 1299,
}
const sum = (ids: readonly string[], by: Record<string, number>): number =>
  ids.reduce((acc, id) => acc + by[id]!, 0)

const fullHistory = (): DistrictRegionHistory =>
  DistrictRegionHistorySchema.parse(
    JSON.parse(
      readFileSync(
        join(
          HERE,
          '__tests__/fixtures/region-rollups/config/district-region-history.json'
        ),
        'utf-8'
      )
    )
  )

/**
 * The real history narrowed, in memory, to the districts this fixture
 * recorded (plus `extra`), so a region is whole exactly when its members
 * were recorded. Nothing else in the history is changed.
 */
function history(extra: readonly string[] = []): DistrictRegionHistory {
  const full = fullHistory()
  const keep = new Set([...ALL, ...extra])
  return {
    ...full,
    districts: Object.fromEntries(
      Object.entries(full.districts).filter(([id]) => keep.has(id))
    ),
  }
}

function district(id: string): RegionSeriesDistrictInput {
  const file = JSON.parse(
    readFileSync(join(FIX, `time-series/district_${id}/${PY}.json`), 'utf-8')
  ) as {
    districtId: string
    dataPoints: Array<{ date: string; membership: number }>
    sourceGapDates?: string[]
  }
  return {
    districtId: file.districtId,
    dataPoints: file.dataPoints,
    ...(file.sourceGapDates && { sourceGapDates: file.sourceGapDates }),
  }
}

const build = (
  districts: RegionSeriesDistrictInput[],
  regionHistory: DistrictRegionHistory | null = history()
) => buildRegionMembershipSeries({ programYear: PY, districts, regionHistory })

describe('buildRegionMembershipSeries (#2127)', () => {
  it('sums a whole region per date from its districts’ own series', () => {
    const series = build(ALL.map(district))
    expect(RegionMembershipSeriesSchema.parse(series)).toEqual(series)
    expect(series.dates).toHaveLength(91)
    expect(series.dates[0]).toBe('2025-07-31')
    expect(series.dates[90]).toBe('2026-06-30')
    const r09 = series.regions!['09']!
    expect(r09.districtIds).toEqual(REGION_09)
    expect(r09.membership[0]).toBe(sum(REGION_09, FIRST))
    expect(r09.membership[90]).toBe(sum(REGION_09, LAST))
    expect(series.regionMembership).toEqual({
      source: 'config/district-region-history.json',
      asOf: '2026-10-12',
      programYear: PY,
    })
    expect(series.regionMembershipNote).toBeNull()
  })

  it('uses the program year’s own regions, and a member with no series is null, never 0', () => {
    // District 31 is placed in Region 05 for 2025-26 but has no series here.
    const series = build(ALL.map(district), history(['31']))
    // District 61 sat in Region 09 until 2024 (its history spans), in 05 since.
    expect(series.regions!['09']!.districtIds).not.toContain('61')
    expect(series.regions!['05']!.districtIds).toEqual(['31', '61'])
    expect(series.regions!['05']!.membership.every(v => v === null)).toBe(true)
    expect(series.uncountedDistricts).toEqual([
      {
        districtId: '31',
        reason: 'no series for this program year',
        dates: series.dates,
      },
    ])
  })

  it('scopes the world to the districts the history places, stating the rest', () => {
    const series = build(ALL.map(district))
    expect(series.unassignedDistricts).toEqual(['U'])
    // The world is Σ the regions: U is stated, not summed.
    expect(series.world.districts).toBe(6)
    expect(series.world.membership[0]).toBe(sum([...REGION_09, '61'], FIRST))
  })

  it('keeps a stray district (a renumbered 2026-27 id stamped on a 2025-26 date) out', () => {
    // Real shape: prod's district_201/2025-2026.json has one point, 2026-06-30.
    const stray: RegionSeriesDistrictInput = {
      districtId: '201',
      dataPoints: [{ date: '2026-06-30', membership: 3000 }],
    }
    const series = build([...REGION_09.map(district), stray])
    expect(series.unassignedDistricts).toEqual(['201'])
    expect(series.regions!['09']!.membership[90]).toBe(sum(REGION_09, LAST))
    expect(series.uncountedDistricts.map(u => u.districtId)).toEqual(['61'])
  })

  it('reads a #1671 gap district as null for its region and the world, never 0', () => {
    // In memory: District 80 recorded a source gap on 2026-06-30 (#2070).
    const d80 = district('80')
    const gapped: RegionSeriesDistrictInput = {
      districtId: d80.districtId,
      dataPoints: d80.dataPoints.filter(p => p.date !== '2026-06-30'),
      sourceGapDates: ['2026-06-30'],
    }
    const series = build(
      [...REGION_09, '61'].map(id => (id === '80' ? gapped : district(id)))
    )
    const r09 = series.regions!['09']!.membership
    expect(r09[90]).toBeNull()
    expect(r09[89]).not.toBeNull()
    expect(series.world.membership[90]).toBeNull()
    expect(series.regions!['05']!.membership[90]).toBe(LAST['61'])
    expect(series.uncountedDistricts).toEqual([
      {
        districtId: '80',
        reason: expect.stringContaining('#1671'),
        dates: ['2026-06-30'],
      },
    ])
  })

  it('states a placed district with no point at a date, reason apart from a gap', () => {
    const d93 = district('93')
    const short: RegionSeriesDistrictInput = {
      districtId: '93',
      dataPoints: d93.dataPoints.slice(1),
    }
    const series = build(
      [...REGION_09, '61'].map(id => (id === '93' ? short : district(id)))
    )
    expect(series.regions!['09']!.membership[0]).toBeNull()
    expect(series.uncountedDistricts).toEqual([
      {
        districtId: '93',
        reason: 'no data point for this date',
        dates: ['2025-07-31'],
      },
    ])
  })

  it('without a usable history: regions null with the reason; the world is not guessed', () => {
    const none = build(ALL.map(district), null)
    expect(RegionMembershipSeriesSchema.parse(none)).toEqual(none)
    expect(none.regions).toBeNull()
    expect(none.regionMembership).toBeNull()
    expect(none.regionMembershipNote).toMatch(/district-region-history/)
    expect(none.world).toEqual({ districts: 0, membership: [] })
    expect(none.dates).toEqual([])

    const later = buildRegionMembershipSeries({
      programYear: '2027-2028',
      districts: [],
      regionHistory: history(),
    })
    expect(later.regions).toBeNull()
    expect(later.regionMembershipNote).toMatch(/no 2027-2028 membership/)
  })

  it('is byte-stable for the same inputs (the publish plan uploads changes only)', () => {
    const a = build(ALL.map(district))
    const b = build([...ALL].reverse().map(district))
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('stays small: two regions over the recorded year are under 4 KB of JSON', () => {
    expect(JSON.stringify(build(ALL.map(district))).length).toBeLessThan(4096)
  })
})
