import { describe, expect, it } from 'vitest'
import {
  CharterCohortSurvivalFileSchema,
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  type ClubDistrictHistoryClub,
} from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/club-district-history-d61-d01.recorded.json'
import d61File from '../../__tests__/fixtures/charter-cohort-survival-d61.json'
import {
  buildCharterCohortSurvival,
  charterCohortSurvivalFromFile,
} from '../charterCohortSurvival'

/* Recorded from the prod CDN on 2026-10-15 (#1817): the real
   config/club-district-history index and all 100 shards, each trimmed to the
   clubs whose byProgramYear names District 61 or 01. Expected values were
   counted independently from the same fixture. */

const index = ClubDistrictHistoryIndexSchema.parse(recorded.index)
const clubs: Record<string, ClubDistrictHistoryClub> = {}
for (const raw of Object.values(recorded.shards)) {
  Object.assign(clubs, ClubDistrictHistoryShardSchema.parse(raw).clubs)
}

const survivors = (
  cohort: { years: ({ survivors: number } | null)[] } | undefined
) => cohort?.years.map(c => (c ? c.survivors : null))

describe('buildCharterCohortSurvival (#1817)', () => {
  const d61 = buildCharterCohortSurvival({
    index,
    clubs,
    districtId: '61',
    throughProgramYear: '2026-2027',
  })

  it('leaves out the first folded program year: its clubs predate the data', () => {
    expect(d61.censoredProgramYear).toBe('2016-2017')
    expect(d61.cohorts.map(c => c.programYear)).not.toContain('2016-2017')
  })

  it('groups clubs by the program year they first appear, in the district that chartered them', () => {
    const sizes = Object.fromEntries(
      d61.cohorts.map(c => [c.programYear, c.chartered])
    )
    expect(sizes).toEqual({
      '2017-2018': 6,
      '2018-2019': 6,
      '2019-2020': 14,
      '2020-2021': 7,
      '2021-2022': 0,
      '2022-2023': 3,
      '2023-2024': 1,
      '2024-2025': 8,
      '2025-2026': 6,
      '2026-2027': 0,
    })
  })

  it('counts a club as surviving year k while it is still seen in program year PY+k', () => {
    const c = d61.cohorts.find(x => x.programYear === '2019-2020')
    expect(survivors(c)?.slice(0, 7)).toEqual([14, 13, 13, 10, 10, 10, 9])
    expect(c?.years[1]?.share).toBeCloseTo(13 / 14)
    const c17 = d61.cohorts.find(x => x.programYear === '2017-2018')
    expect(survivors(c17)?.slice(0, 9)).toEqual([6, 6, 6, 4, 4, 3, 3, 3, 3])
  })

  it('marks a year not yet reached as null, never 0', () => {
    const c = d61.cohorts.find(x => x.programYear === '2025-2026')
    expect(c?.years[0]?.survivors).toBe(6)
    expect(c?.years[1]).toBeNull()
    expect(d61.maxYears).toBe(9)
    const empty = d61.cohorts.find(x => x.programYear === '2021-2022')
    expect(empty?.years.every(y => y === null)).toBe(true)
  })

  it('flags the in-progress program year as provisional', () => {
    const c = d61.cohorts.find(x => x.programYear === '2025-2026')
    expect(c?.years[0]?.programYear).toBe('2026-2027')
    expect(c?.years[0]?.provisional).toBe(true)
    const c19 = d61.cohorts.find(x => x.programYear === '2019-2020')
    expect(c19?.years[0]?.provisional).toBe(false)
  })

  it('pools every cohort that has reached year k', () => {
    expect(d61.pooled[0]).toMatchObject({ chartered: 51, survivors: 51 })
    expect(d61.pooled[1]).toMatchObject({ chartered: 45, survivors: 44 })
    expect(d61.pooled[1]?.share).toBeCloseTo(44 / 45)
  })

  it('counts a club that moved district as surviving (D01 → D201)', () => {
    const d01 = buildCharterCohortSurvival({
      index,
      clubs,
      districtId: '01',
      throughProgramYear: '2026-2027',
    })
    const c = d01.cohorts.find(x => x.programYear === '2017-2018')
    expect(survivors(c)?.slice(0, 9)).toEqual([11, 9, 7, 6, 5, 4, 3, 3, 3])
    expect(c?.movedAway).toBe(3)
    const c22 = d01.cohorts.find(x => x.programYear === '2022-2023')
    expect(survivors(c22)?.slice(0, 4)).toEqual([7, 7, 6, 5])
    expect(c22?.movedAway).toBe(5)
  })

  it('stops at the program year the page controls select (R3)', () => {
    const past = buildCharterCohortSurvival({
      index,
      clubs,
      districtId: '61',
      throughProgramYear: '2019-2020',
    })
    expect(past.cohorts.map(c => c.programYear)).toEqual([
      '2017-2018',
      '2018-2019',
      '2019-2020',
    ])
    expect(past.maxYears).toBe(2)
    const c17 = past.cohorts[0]
    expect(survivors(c17)).toEqual([6, 6])
    expect(c17?.years[1]?.provisional).toBe(false)
  })

  it('returns no cohorts for a district the history never names', () => {
    const none = buildCharterCohortSurvival({
      index,
      clubs,
      districtId: '999',
      throughProgramYear: '2026-2027',
    })
    expect(none.cohorts.every(c => c.chartered === 0)).toBe(true)
    expect(none.pooled.every(p => p === null)).toBe(true)
  })
})

/* #2061 — the pipeline's per-district file must draw exactly the curves the
   in-browser fold draws from the recorded history. The file is the
   pipeline fold's output over the same recording
   (scripts/lib/__tests__/charterCohortSurvival.test.ts reproduces it). */
describe('the per-district survival file equals the in-browser fold (#2061)', () => {
  const file = CharterCohortSurvivalFileSchema.parse(d61File)

  it.each([
    ...index.programYears,
    // Selections outside the history: before it, and after it.
    '2015-2016',
    '2027-2028',
  ])('through %s', through => {
    expect(charterCohortSurvivalFromFile(file, through)).toEqual(
      buildCharterCohortSurvival({
        index,
        clubs,
        districtId: '61',
        throughProgramYear: through,
      })
    )
  })

  it('keeps the rules: 2016-17 is censored, a year not reached is null', () => {
    const s = charterCohortSurvivalFromFile(file, '2026-2027')
    expect(s.censoredProgramYear).toBe('2016-2017')
    expect(s.cohorts.map(c => c.programYear)).not.toContain('2016-2017')
    const c25 = s.cohorts.find(c => c.programYear === '2025-2026')
    expect(c25?.years.slice(1).every(y => y === null)).toBe(true)
  })
})
