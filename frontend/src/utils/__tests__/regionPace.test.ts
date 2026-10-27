/* "On track, based on last year's pace" (#2307, rule approved by Ron
   2026-10-27): a district is on track for a tier when each of its paid
   clubs ÷ club base, payments ÷ payment base and Distinguished clubs ÷ club
   base is at least the median, on the same day of the reference program
   year (or the nearest earlier snapshot), of the districts that earned that
   tier or higher at the reference year's end. */

import { describe, it, expect } from 'vitest'
import {
  PACE_REFERENCE_YEARS,
  paceReferenceDate,
  paceYearEndDate,
  paceRatios,
  paceMedians,
  isOnTrack,
} from '../regionPace'
import type { DistinguishedDistrictTier } from '../../services/cdn'

const DATES = [
  '2025-07-31',
  '2025-08-31',
  '2025-09-30',
  '2025-10-31',
  '2026-02-28',
  '2026-06-29',
  '2026-06-30',
  '2026-07-26',
  '2026-10-25',
]

describe('PACE_REFERENCE_YEARS', () => {
  it('measures 2026-27 against 2025-26 only', () => {
    expect(PACE_REFERENCE_YEARS).toEqual({ '2026-2027': '2025-2026' })
  })
})

describe('paceReferenceDate', () => {
  it('uses the same day last year when that snapshot exists', () => {
    expect(paceReferenceDate('2026-09-30', '2025-2026', DATES)).toBe(
      '2025-09-30'
    )
  })

  it('prefers the nearest earlier snapshot in the same renewal period', () => {
    // 2025-09-29 → 2025-08-31 (earlier, Jul–Sep), not the later 2025-09-30.
    expect(paceReferenceDate('2026-09-29', '2025-2026', DATES)).toBe(
      '2025-08-31'
    )
  })

  it('never compares across the October 1 renewal boundary (Ron, option b)', () => {
    // 2025-10-05 sits in Oct–Mar; 2025-09-30 is the nearest earlier date
    // but falls before the October reset, so it is not used.
    expect(paceReferenceDate('2026-10-05', '2025-2026', DATES)).toBe(
      '2025-10-31'
    )
  })

  it('never compares across the April 1 renewal boundary', () => {
    expect(
      paceReferenceDate('2027-04-05', '2026-2027', ['2027-03-31', '2027-04-10'])
    ).toBe('2027-04-10')
  })

  it('falls back to the nearest later snapshot in the period', () => {
    // Today's case: 2026-10-26 → 2025-10-26; nothing kept Oct 1–26, so the
    // later 2025-10-31 in the same period.
    expect(paceReferenceDate('2026-10-26', '2025-2026', DATES)).toBe(
      '2025-10-31'
    )
    expect(paceReferenceDate('2026-07-26', '2025-2026', DATES)).toBe(
      '2025-07-31'
    )
  })

  it('is not available when the renewal period has no snapshot', () => {
    expect(
      paceReferenceDate('2026-10-05', '2025-2026', ['2025-09-30', '2026-04-30'])
    ).toBeNull()
    expect(
      paceReferenceDate('2026-08-05', '2025-2026', ['2025-06-30'])
    ).toBeNull()
  })

  it('maps 29 February to 28 February', () => {
    expect(paceReferenceDate('2028-02-29', '2026-2027', ['2027-02-28'])).toBe(
      '2027-02-28'
    )
  })
})

describe('paceYearEndDate', () => {
  it('is the reference year June 30 snapshot', () => {
    expect(paceYearEndDate('2025-2026', DATES)).toBe('2026-06-30')
  })

  it('is null when the year-end snapshot is missing', () => {
    expect(paceYearEndDate('2025-2026', ['2026-06-29'])).toBeNull()
  })
})

const row = (
  districtId: string,
  paidClubs: number,
  totalPayments: number,
  distinguishedClubs: number,
  paidClubBase = 100,
  paymentBase = 1000
) => ({
  districtId,
  paidClubBase,
  paymentBase,
  paidClubs,
  totalPayments,
  distinguishedClubs,
})

describe('paceRatios', () => {
  it('divides each count by its base', () => {
    expect(paceRatios(row('1', 102, 450, 10, 100, 1000))).toEqual({
      clubs: 1.02,
      payments: 0.45,
      distinguished: 0.1,
    })
  })

  it('is null without a base', () => {
    expect(paceRatios(row('1', 5, 5, 0, 0, 1000))).toBeNull()
    expect(paceRatios(row('1', 5, 5, 0, 100, 0))).toBeNull()
  })
})

describe('paceMedians', () => {
  const tiers = (t: Record<string, DistinguishedDistrictTier>) =>
    Object.fromEntries(
      Object.entries(t).map(([id, currentTier]) => [id, { currentTier }])
    )

  it('takes the median of the districts that earned the tier or higher', () => {
    const m = paceMedians(
      [
        row('1', 100, 400, 0),
        row('2', 102, 500, 10),
        row('3', 104, 600, 20),
        row('4', 90, 100, 0), // did not earn a tier
      ],
      tiers({
        '1': 'Distinguished',
        '2': 'Select',
        '3': 'Smedley',
        '4': 'NotDistinguished',
      }),
      ['Distinguished', 'Select', 'Presidents', 'Smedley']
    )
    expect(m.Distinguished).toEqual({
      clubs: 1.02,
      payments: 0.5,
      distinguished: 0.1,
      districts: 3,
    })
    // Even count: the mean of the two middle values.
    expect(m.Select).toEqual({
      clubs: expect.closeTo(1.03, 10),
      payments: expect.closeTo(0.55, 10),
      distinguished: expect.closeTo(0.15, 10),
      districts: 2,
    })
    expect(m.Smedley!.districts).toBe(1)
  })

  it('has no median for a tier nobody earned, and skips Unknown', () => {
    const m = paceMedians(
      [row('1', 100, 400, 0), row('2', 100, 400, 0)],
      tiers({ '1': 'Distinguished', '2': 'Unknown' }),
      ['Distinguished', 'Select']
    )
    expect(m.Distinguished!.districts).toBe(1)
    expect(m.Select).toBeNull()
  })

  it('leaves out districts without a base or a year-end tier', () => {
    const m = paceMedians(
      [row('1', 100, 400, 0), row('2', 5, 5, 0, 0), row('3', 120, 900, 50)],
      tiers({ '1': 'Select', '2': 'Select' }),
      ['Distinguished']
    )
    expect(m.Distinguished!.districts).toBe(1)
  })
})

describe('isOnTrack', () => {
  const median = {
    clubs: 1.02,
    payments: 0.5,
    distinguished: 0.1,
    districts: 3,
  }

  it('needs every ratio at or above the median', () => {
    expect(isOnTrack(row('1', 102, 500, 10), median)).toBe(true)
    expect(isOnTrack(row('1', 101, 900, 50), median)).toBe(false)
    expect(isOnTrack(row('1', 110, 499, 50), median)).toBe(false)
    expect(isOnTrack(row('1', 110, 900, 9), median)).toBe(false)
  })

  it('is false without a base', () => {
    expect(isOnTrack(row('1', 110, 900, 50, 0), median)).toBe(false)
  })
})
