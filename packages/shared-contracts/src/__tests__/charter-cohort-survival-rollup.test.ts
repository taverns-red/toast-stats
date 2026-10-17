import { describe, expect, it } from 'vitest'

import {
  CharterCohortSurvivalRollupFileSchema,
  buildCharterCohortSurvivalRollup,
  buildCharterCohortSurvivalRollupFile,
  charterCohortSurvivalFromRollupFile,
  charterCohortSurvivalRollupObjectPath,
  type ClubDistrictHistoryClub,
  type DistrictRegionHistory,
} from '../index.js'

/**
 * #1818 — charter cohort survival for a region and for the world, the
 * region and world variants of the district file (#2061):
 * `config/charter-cohort-survival/region_<NN>.json` and `.../world.json`.
 * Same rules as the district fold: a club that moved still survives, the
 * first folded program year is censored, a year not reached is `null`,
 * never 0. A club belongs to a region's cohort when its district sat in
 * that region in the club's charter program year (#1820: each year's own
 * membership, not today's).
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

const span = { from: '2017-06-30', to: null, region: 'x' }
const regionHistory: Pick<DistrictRegionHistory, 'districts'> = {
  districts: {
    // District 61 was redrawn from Region 06 into Region 09 in 2018-19.
    '61': {
      spans: [span],
      byProgramYear: {
        '2016-2017': '06',
        '2017-2018': '06',
        '2018-2019': '09',
        '2019-2020': '09',
      },
    },
    '201': {
      spans: [span],
      byProgramYear: {
        '2016-2017': '09',
        '2017-2018': '09',
        '2018-2019': '09',
        '2019-2020': '09',
      },
    },
    '01': {
      spans: [span],
      byProgramYear: {
        '2016-2017': '10',
        '2017-2018': '10',
        '2018-2019': '10',
        '2019-2020': '10',
      },
    },
  },
}

const clubs: Record<string, ClubDistrictHistoryClub> = {
  // Censored: seen in the first folded year, never a cohort member.
  '1': club({ '2016-2017': '61', '2017-2018': '61' }),
  // Chartered 2017-18 in 61 (Region 06), moved to 201 and still alive.
  '2': club({ '2017-2018': '61', '2018-2019': '201', '2019-2020': '201' }),
  // Chartered 2017-18 in 61 (Region 06); its district was redrawn into 09.
  '3': club({ '2017-2018': '61', '2018-2019': '61' }),
  // Chartered 2017-18 in 01 (Region 10).
  '4': club({ '2017-2018': '01', '2018-2019': '01' }),
  // Chartered 2018-19 in 61, by then Region 09.
  '5': club({ '2018-2019': '61', '2019-2020': '61' }),
  // Chartered 2018-19 in 201 (Region 09), closed after its first year.
  '6': club({ '2018-2019': '201' }),
  // A district the region history does not know: in no region's cohort.
  '7': club({ '2018-2019': 'U', '2019-2020': 'U' }),
}

const through = '2019-2020'
const region06 = buildCharterCohortSurvivalRollup({
  index,
  clubs,
  regionHistory,
  scope: { kind: 'region', regionId: '06' },
  throughProgramYear: through,
})
const region09 = buildCharterCohortSurvivalRollup({
  index,
  clubs,
  regionHistory,
  scope: { kind: 'region', regionId: '09' },
  throughProgramYear: through,
})
const world = buildCharterCohortSurvivalRollup({
  index,
  clubs,
  regionHistory,
  scope: { kind: 'world' },
  throughProgramYear: through,
})

const charteredBy = (s: typeof world) =>
  Object.fromEntries(s.cohorts.map(c => [c.programYear, c.chartered]))

describe('region charter cohort survival (#1818)', () => {
  it("places a club by its district's region in its charter program year", () => {
    expect(charteredBy(region06)).toEqual({
      '2017-2018': 2,
      '2018-2019': 0,
      '2019-2020': 0,
    })
    expect(charteredBy(region09)).toEqual({
      '2017-2018': 0,
      '2018-2019': 2,
      '2019-2020': 0,
    })
  })

  it('counts a club now in another region (moved or redrawn) as surviving, and as moved away', () => {
    const c17 = region06.cohorts[0]!
    expect(c17.years.map(y => y?.survivors ?? null)).toEqual([2, 1])
    expect(c17.movedAway).toBe(2)
  })

  it('leaves out the censored year and never writes 0 for a year not reached', () => {
    expect(region06.censoredProgramYear).toBe('2016-2017')
    expect(region06.cohorts.map(c => c.programYear)).not.toContain('2016-2017')
    // 2018-19's cohort has reached year 1 only.
    expect(region09.cohorts[1]!.years[1]).toBeNull()
    expect(region09.cohorts[1]!.years[0]).toMatchObject({ survivors: 1 })
  })

  it('names its scope', () => {
    expect(region06.scope).toEqual({ kind: 'region', regionId: '06' })
    expect(region06.throughProgramYear).toBe(through)
    expect(region06.asOf).toBe(index.asOf)
  })
})

describe('world charter cohort survival (#1818)', () => {
  it('holds every chartered club, whatever its district or region', () => {
    expect(charteredBy(world)).toEqual({
      '2017-2018': 3,
      '2018-2019': 3,
      '2019-2020': 0,
    })
  })

  it('has nowhere to move away to', () => {
    expect(world.cohorts.every(c => c.movedAway === 0)).toBe(true)
  })

  it('pools every cohort that reached each year', () => {
    expect(world.pooled[0]).toEqual({
      chartered: 6,
      survivors: 5,
      share: 5 / 6,
      provisional: true,
    })
    expect(world.pooled[1]).toEqual({
      chartered: 3,
      survivors: 1,
      share: 1 / 3,
      provisional: true,
    })
  })
})

describe('rollup survival file (#1818)', () => {
  const regionFile = buildCharterCohortSurvivalRollupFile({
    index,
    clubs,
    regionHistory,
    scope: { kind: 'region', regionId: '06' },
  })
  const worldFile = buildCharterCohortSurvivalRollupFile({
    index,
    clubs,
    regionHistory,
    scope: { kind: 'world' },
  })

  it('is schema-valid and covers every program year of the history', () => {
    for (const file of [regionFile, worldFile]) {
      expect(CharterCohortSurvivalRollupFileSchema.parse(file)).toEqual(file)
      expect(file._format.type).toBe('charter-cohort-survival-rollup')
      expect(Object.keys(file.byThroughProgramYear)).toEqual(index.programYears)
    }
    expect(regionFile.scope).toEqual({ kind: 'region', regionId: '06' })
    expect(worldFile.scope).toEqual({ kind: 'world' })
  })

  it('gives the folded curves for every selectable program year', () => {
    for (const py of [
      ...index.programYears,
      '2015-2016',
      '2020-2021',
      '2026-2027',
    ]) {
      expect(charterCohortSurvivalFromRollupFile(worldFile, py), py).toEqual(
        buildCharterCohortSurvivalRollup({
          index,
          clubs,
          regionHistory,
          scope: { kind: 'world' },
          throughProgramYear: py,
        })
      )
    }
  })

  it('rejects a malformed region id', () => {
    const bad = structuredClone(regionFile)
    bad.scope = { kind: 'region', regionId: '../6' }
    expect(CharterCohortSurvivalRollupFileSchema.safeParse(bad).success).toBe(
      false
    )
  })

  it('lives beside the district files and refuses an unsafe region id', () => {
    expect(
      charterCohortSurvivalRollupObjectPath({ kind: 'region', regionId: '06' })
    ).toBe('config/charter-cohort-survival/region_06.json')
    expect(charterCohortSurvivalRollupObjectPath({ kind: 'world' })).toBe(
      'config/charter-cohort-survival/world.json'
    )
    for (const regionId of ['6', '../06', '', 'DNAR']) {
      expect(() =>
        charterCohortSurvivalRollupObjectPath({ kind: 'region', regionId })
      ).toThrow()
    }
  })
})
