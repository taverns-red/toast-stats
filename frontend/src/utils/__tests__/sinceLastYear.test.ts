import { describe, expect, it } from 'vitest'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import {
  compareSinceLastYear,
  lookupSinceLastYear,
  matchesSinceLastYear,
  resolvePriorYearDate,
  summarizeSinceLastYear,
} from '../sinceLastYear'

const club = (
  clubId: string,
  goals: number,
  charterDate?: string
): ClubTrend => ({
  clubId,
  clubName: `Club ${clubId}`,
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  membershipTrend: [{ date: '2026-10-31', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-10-31', goalsAchieved: goals }],
  currentStatus: 'thriving',
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished',
  ...(charterDate ? { charterDate } : {}),
})

describe('resolvePriorYearDate (#2432)', () => {
  it('uses the same date in the prior program year when a snapshot exists', () => {
    expect(
      resolvePriorYearDate('2026-10-31', [
        '2025-10-30',
        '2025-10-31',
        '2025-11-01',
        '2026-10-31',
      ])
    ).toEqual({ targetDate: '2025-10-31', comparisonDate: '2025-10-31' })
  })

  it('falls back to the nearest earlier snapshot when that date is missing', () => {
    expect(
      resolvePriorYearDate('2026-10-31', [
        '2025-10-03',
        '2025-10-28',
        '2025-11-02',
        '2026-10-31',
      ])
    ).toEqual({ targetDate: '2025-10-31', comparisonDate: '2025-10-28' })
  })

  it('never reaches back before the prior program year starts (Jul 1)', () => {
    // 2025-06-30 is the 2024-25 close — a different year's DCP, not last year's.
    expect(
      resolvePriorYearDate('2026-08-15', ['2025-06-30', '2025-08-20'])
    ).toEqual({ targetDate: '2025-08-15', comparisonDate: null })
  })

  it('finds no comparison for a district formed this year (the 200-series)', () => {
    // The 2xx districts' history starts at the 2026-06-30 close.
    expect(
      resolvePriorYearDate('2026-10-31', [
        '2026-06-30',
        '2026-07-31',
        '2026-10-31',
      ])
    ).toEqual({ targetDate: '2025-10-31', comparisonDate: null })
  })

  it('maps Feb 29 to the nearest earlier date a year before', () => {
    expect(
      resolvePriorYearDate('2028-02-29', ['2027-02-27', '2027-02-28'])
    ).toEqual({ targetDate: '2027-02-28', comparisonDate: '2027-02-28' })
  })
})

describe('compareSinceLastYear (#2432)', () => {
  const comparisonDate = '2025-10-31'

  it('compares DCP goals now with the prior-year snapshot', () => {
    const byClub = compareSinceLastYear(
      [club('1', 5), club('2', 2), club('3', 4)],
      [
        { clubId: '1', dcpGoals: 3 },
        { clubId: '2', dcpGoals: 6 },
        { clubId: '3', dcpGoals: 4 },
      ],
      comparisonDate
    )
    expect(lookupSinceLastYear(byClub, '1')).toEqual({
      kind: 'compared',
      now: 5,
      then: 3,
      delta: 2,
    })
    expect(lookupSinceLastYear(byClub, '2')).toEqual({
      kind: 'compared',
      now: 2,
      then: 6,
      delta: -4,
    })
    expect(lookupSinceLastYear(byClub, '3')).toMatchObject({ delta: 0 })
  })

  it('matches clubs whose ids differ only by zero-padding', () => {
    const byClub = compareSinceLastYear(
      [club('2274', 4)],
      [{ clubId: '00002274', dcpGoals: 1 }],
      comparisonDate
    )
    expect(lookupSinceLastYear(byClub, '2274')).toMatchObject({ delta: 3 })
  })

  it('labels a club chartered since the comparison date as no prior data', () => {
    const byClub = compareSinceLastYear(
      [club('28679503', 6, '2025-12-01')],
      [{ clubId: '1', dcpGoals: 2 }],
      comparisonDate
    )
    expect(lookupSinceLastYear(byClub, '28679503')).toEqual({
      kind: 'no-prior',
      reason: 'chartered-since',
    })
  })

  it('labels a long-chartered club missing from last year (realignment) as no prior data, never a climber', () => {
    // Club 9472 (chartered 1993) was not in this district on the comparison
    // date — it arrived through realignment. Its 7 goals must not read as +7.
    const byClub = compareSinceLastYear(
      [club('9472', 7, '1993-06-01')],
      [{ clubId: '1', dcpGoals: 2 }],
      comparisonDate
    )
    const entry = lookupSinceLastYear(byClub, '9472')
    expect(entry).toEqual({ kind: 'no-prior', reason: 'not-in-district' })
    expect(matchesSinceLastYear(entry, 'climbed')).toBe(false)
    expect(matchesSinceLastYear(entry, 'no-prior')).toBe(true)
  })

  it('labels every club as no prior data when the district has no prior-year snapshot', () => {
    const byClub = compareSinceLastYear(
      [club('1', 5), club('2', 0)],
      null,
      null
    )
    expect(lookupSinceLastYear(byClub, '1')).toEqual({
      kind: 'no-prior',
      reason: 'no-snapshot',
    })
    expect(summarizeSinceLastYear(byClub, ['1', '2'])).toEqual({
      climbed: 0,
      slipped: 0,
      unchanged: 0,
      noPrior: 2,
    })
  })
})

describe('matchesSinceLastYear / summarizeSinceLastYear (#2432)', () => {
  const byClub = compareSinceLastYear(
    [club('1', 5), club('2', 2), club('3', 4), club('4', 3, '2026-01-01')],
    [
      { clubId: '1', dcpGoals: 3 },
      { clubId: '2', dcpGoals: 6 },
      { clubId: '3', dcpGoals: 4 },
    ],
    '2025-10-31'
  )

  it('picks climbers, slippers and no-prior clubs; unchanged clubs are neither', () => {
    const ids = ['1', '2', '3', '4']
    const pick = (mode: 'climbed' | 'slipped' | 'no-prior') =>
      ids.filter(id =>
        matchesSinceLastYear(lookupSinceLastYear(byClub, id), mode)
      )
    expect(pick('climbed')).toEqual(['1'])
    expect(pick('slipped')).toEqual(['2'])
    expect(pick('no-prior')).toEqual(['4'])
  })

  it('a club with no entry matches no mode', () => {
    expect(matchesSinceLastYear(undefined, 'climbed')).toBe(false)
    expect(matchesSinceLastYear(undefined, 'no-prior')).toBe(false)
  })

  it('counts the given clubs only', () => {
    expect(summarizeSinceLastYear(byClub, ['1', '2', '3', '4'])).toEqual({
      climbed: 1,
      slipped: 1,
      unchanged: 1,
      noPrior: 1,
    })
    expect(summarizeSinceLastYear(byClub, ['1'])).toEqual({
      climbed: 1,
      slipped: 0,
      unchanged: 0,
      noPrior: 0,
    })
  })
})
