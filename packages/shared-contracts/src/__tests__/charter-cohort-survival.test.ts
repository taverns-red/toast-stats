import { describe, expect, it } from 'vitest'

import {
  CharterCohortSurvivalFileSchema,
  buildCharterCohortSurvival,
  buildCharterCohortSurvivalFile,
  charterCohortSurvivalFromFile,
  charterCohortSurvivalObjectPath,
  type ClubDistrictHistoryClub,
} from '../index.js'

/**
 * #2061 — `config/charter-cohort-survival/district_<id>.json`, the charter
 * cohort survival curves of one district, precomputed by the pipeline so the
 * survival page stops fetching all 100 club-district history shards. The
 * file holds the curves for every program year the history covers; the page
 * picks the one its controls select (R3). The real-data equality check
 * (recorded D61 history against the recorded file) is in the frontend,
 * beside the in-browser computation's own tests.
 */

const club = (
  byProgramYear: Record<string, string>
): ClubDistrictHistoryClub => ({
  name: 'Club',
  formerNames: [],
  firstSeen: '2017-07-01',
  lastSeen: '2026-10-01',
  spans: [{ from: '2017-07-01', to: null, districtId: '61' }],
  byProgramYear,
})

const index = {
  programYears: ['2016-2017', '2017-2018', '2018-2019', '2019-2020'],
  asOf: '2019-10-01',
}

const clubs: Record<string, ClubDistrictHistoryClub> = {
  // Censored: seen in the first folded year, never a cohort member.
  '1': club({ '2016-2017': '61', '2017-2018': '61' }),
  // Chartered 2017-18 in 61, moved to 201 and still alive: surviving.
  '2': club({ '2017-2018': '61', '2018-2019': '201', '2019-2020': '201' }),
  // Chartered 2017-18 in 61, closed after one year.
  '3': club({ '2017-2018': '61', '2018-2019': '61' }),
  // Chartered elsewhere: not this district's cohort.
  '4': club({ '2017-2018': '01', '2018-2019': '01' }),
  // Absent one year, back the next.
  '5': club({ '2018-2019': '61', '2019-2020': '61' }),
}

const file = buildCharterCohortSurvivalFile({ index, clubs, districtId: '61' })

describe('charter cohort survival file (#2061)', () => {
  it('is schema-valid and names its district, asOf and program years', () => {
    expect(CharterCohortSurvivalFileSchema.parse(file)).toEqual(file)
    expect(file._format.type).toBe('charter-cohort-survival')
    expect(file.districtId).toBe('61')
    expect(file.asOf).toBe('2019-10-01')
    expect(Object.keys(file.byThroughProgramYear)).toEqual(index.programYears)
  })

  it('gives the in-browser curves for every selectable program year', () => {
    for (const through of [
      ...index.programYears,
      '2015-2016',
      '2020-2021',
      '2026-2027',
    ]) {
      expect(charterCohortSurvivalFromFile(file, through), through).toEqual(
        buildCharterCohortSurvival({
          index,
          clubs,
          districtId: '61',
          throughProgramYear: through,
        })
      )
    }
  })

  it('counts a moved club as surviving, leaves out the censored year, and never writes 0 for a year not reached', () => {
    const s = charterCohortSurvivalFromFile(file, '2019-2020')
    expect(s.censoredProgramYear).toBe('2016-2017')
    expect(s.cohorts.map(c => c.programYear)).toEqual([
      '2017-2018',
      '2018-2019',
      '2019-2020',
    ])
    const c17 = s.cohorts[0]!
    expect(c17.chartered).toBe(2)
    expect(c17.movedAway).toBe(1)
    expect(c17.years.map(y => y?.survivors ?? null)).toEqual([2, 1])
    // 2019-20's cohort has no year 1 yet: null, not 0.
    expect(s.cohorts[2]!.years).toEqual([null, null])
  })

  it('rejects a share outside 0..1 and a negative count', () => {
    const bad = structuredClone(file)
    const cell = bad.byThroughProgramYear['2019-2020']!.cohorts[0]!.years[0]!
    cell.share = 1.5
    expect(CharterCohortSurvivalFileSchema.safeParse(bad).success).toBe(false)
    cell.share = 0.5
    cell.survivors = -1
    expect(CharterCohortSurvivalFileSchema.safeParse(bad).success).toBe(false)
  })

  it('lives under config/, one object per district, and refuses an unsafe id', () => {
    expect(charterCohortSurvivalObjectPath('61')).toBe(
      'config/charter-cohort-survival/district_61.json'
    )
    expect(() => charterCohortSurvivalObjectPath('../61')).toThrow()
    expect(() => charterCohortSurvivalObjectPath('')).toThrow()
  })
})
