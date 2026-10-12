/**
 * District → region history fold (#1820, epic #1781).
 *
 * Fixtures are RECORDED: real `snapshots/<date>/all-districts-rankings.json`
 * files read once each from staging on 2026-10-11 (metadata and rows
 * verbatim), trimmed to six rows:
 *   61   Region 06 (2016-17) → 05 (2024-25 on): a district that changed region
 *   01   Region 10 → 02, retired in the 2026 reformation (absent 2026-07-26)
 *   05   Region 10 → 02, retired
 *   03   Region 10 → 02, still active
 *   201  new in 2026-27, Region 02
 *   U    the undistricted row (region "DNAR") — not a district
 * Dates: 2017-06-30 (PY 2016-17 year-end), 2025-06-30 (2024-25),
 * 2026-06-30 (2025-26), 2026-07-26 and 2026-10-10 (first and latest of
 * 2026-27). Hand-made inputs are mutations of those, named where made.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  AllDistrictsRankingsDataSchema,
  DistrictRegionHistorySchema,
} from '@taverns-red/shared-contracts'
import {
  foldDistrictRegionHistory,
  selectRegionSourceDates,
  type RegionSource,
} from '../districtRegionHistory.js'

const FIXTURES = path.resolve(__dirname, 'fixtures/identity-history/snapshots')
const DATES = [
  '2017-06-30',
  '2025-06-30',
  '2026-06-30',
  '2026-07-26',
  '2026-10-10',
]

function loadSources(): RegionSource[] {
  return DATES.map(date => ({
    snapshotDate: date,
    rankings: AllDistrictsRankingsDataSchema.parse(
      JSON.parse(
        fs.readFileSync(
          path.join(FIXTURES, date, 'all-districts-rankings.json'),
          'utf-8'
        )
      )
    ),
  }))
}

describe('foldDistrictRegionHistory — recorded rankings', () => {
  it('satisfies the shared contract', () => {
    const history = foldDistrictRegionHistory(loadSources())
    expect(() => DistrictRegionHistorySchema.parse(history)).not.toThrow()
  })

  it('stamps asOf, program years and source dates from the inputs', () => {
    const history = foldDistrictRegionHistory(loadSources())
    expect(history.asOf).toBe('2026-10-10')
    expect(history.sourceDates).toEqual(DATES)
    expect(history.programYears).toEqual([
      '2016-2017',
      '2024-2025',
      '2025-2026',
      '2026-2027',
    ])
  })

  it('a district that changed region gets one span per region, by its own PY', () => {
    expect(foldDistrictRegionHistory(loadSources()).districts['61']).toEqual({
      spans: [
        { from: '2017-06-30', to: '2017-06-30', region: '06' },
        { from: '2025-06-30', to: null, region: '05' },
      ],
      byProgramYear: {
        '2016-2017': '06',
        '2024-2025': '05',
        '2025-2026': '05',
        '2026-2027': '05',
      },
    })
  })

  it('takes the PY from the snapshot (logical) date: the June close is its own year', () => {
    // 2026-06-30's rankings were sourced from the 2026-07-25 CSV; it is
    // still PY 2025-26 (the CLAUDE.md tripwire).
    const d01 = foldDistrictRegionHistory(loadSources()).districts['01']
    expect(d01?.byProgramYear['2025-2026']).toBe('02')
    expect(d01?.byProgramYear['2026-2027']).toBeUndefined()
  })

  it('a retired district is kept, its last span closed at its last sighting', () => {
    const { districts } = foldDistrictRegionHistory(loadSources())
    for (const id of ['01', '05']) {
      expect(districts[id]?.spans).toEqual([
        { from: '2017-06-30', to: '2017-06-30', region: '10' },
        { from: '2025-06-30', to: '2026-06-30', region: '02' },
      ])
    }
  })

  it('a new district starts at its first sighting, open-ended', () => {
    expect(
      foldDistrictRegionHistory(loadSources()).districts['201']?.spans
    ).toEqual([{ from: '2026-07-26', to: null, region: '02' }])
  })

  it('leaves out the undistricted row (U, region DNAR)', () => {
    expect(
      foldDistrictRegionHistory(loadSources()).districts['U']
    ).toBeUndefined()
  })

  it('reports no conflicts when each PY has one region per district', () => {
    expect(foldDistrictRegionHistory(loadSources()).conflicts).toEqual([])
  })

  it('is order-independent: identical bytes for reversed input', () => {
    const sources = loadSources()
    expect(
      JSON.stringify(foldDistrictRegionHistory([...sources].reverse()))
    ).toBe(JSON.stringify(foldDistrictRegionHistory(sources)))
  })
})

describe('foldDistrictRegionHistory — edge cases on recorded rows', () => {
  it('a district seen in two regions in one PY is reported, never silently chosen', () => {
    const sources = loadSources()
    // Mutation: District 61 in Region 09 on 2026-07-26 (first date of
    // 2026-27), back in 05 by 2026-10-10.
    const row = sources[3]!.rankings.rankings.find(r => r.districtId === '61')!
    row.region = '09'
    const history = foldDistrictRegionHistory(sources)
    expect(history.conflicts).toEqual([
      {
        districtId: '61',
        programYear: '2026-2027',
        regions: [
          { region: '05', firstSeen: '2026-10-10', lastSeen: '2026-10-10' },
          { region: '09', firstSeen: '2026-07-26', lastSeen: '2026-07-26' },
        ],
      },
    ])
    // The year's last sampled date decides byProgramYear.
    expect(history.districts['61']?.byProgramYear['2026-2027']).toBe('05')
    expect(history.districts['61']?.spans).toEqual([
      { from: '2017-06-30', to: '2017-06-30', region: '06' },
      { from: '2025-06-30', to: '2026-06-30', region: '05' },
      { from: '2026-07-26', to: '2026-07-26', region: '09' },
      { from: '2026-10-10', to: null, region: '05' },
    ])
  })

  it('refuses an empty input', () => {
    expect(() => foldDistrictRegionHistory([])).toThrow(/no rankings/)
  })

  it('refuses two sources for one date', () => {
    const sources = loadSources()
    expect(() => foldDistrictRegionHistory([...sources, sources[0]!])).toThrow(
      /2017-06-30/
    )
  })
})

describe('selectRegionSourceDates', () => {
  it('picks the first and last snapshot date of every program year, by logical date', () => {
    expect(
      selectRegionSourceDates([
        '2026-10-10',
        '2017-01-31',
        '2017-06-30',
        '2017-07-31',
        '2018-06-30',
        '2026-06-30',
        '2026-07-26',
        '2026-09-30',
      ])
    ).toEqual([
      '2017-01-31',
      '2017-06-30',
      '2017-07-31',
      '2018-06-30',
      '2026-06-30',
      '2026-07-26',
      '2026-10-10',
    ])
  })

  it('ignores anything that is not a YYYY-MM-DD date and de-duplicates', () => {
    expect(
      selectRegionSourceDates(['2026-10-10', '2026-10-10', 'latest', ''])
    ).toEqual(['2026-10-10'])
  })
})
