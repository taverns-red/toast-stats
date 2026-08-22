/**
 * Time-series year-over-year across the 2026 district reformation (#1442).
 *
 * Sites 2 and 3 of 4. `computeYearOverYear` and
 * `computePaymentYoYFromTimeSeries` both compare the latest current-PY point
 * against the closest prior-PY point of the SAME district id. For a district
 * that absorbed another on 2026-07-01, "its own past self" is a materially
 * smaller district, and the comparison reads as growth that never happened.
 */

import { describe, it, expect } from 'vitest'
import {
  computeYearOverYear,
  computePaymentYoYFromTimeSeries,
  detectTimeSeriesReformationDiscontinuity,
} from '../useTimeSeriesYoY'
import { DISTRICT_REFORMATION_NOTICE } from '@taverns-red/shared-contracts'
import type { TimeSeriesData } from '../useTimeSeries'
import type { ProgramYearIndexFile } from '@taverns-red/shared-contracts'

function makeProgramYear(
  programYear: string,
  dataPoints: Array<{
    date: string
    membership: number
    payments?: number
    distinguishedTotal: number
    clubCounts: { total: number; thriving: number }
  }>
): ProgramYearIndexFile {
  return {
    districtId: '61',
    programYear,
    startDate: `${programYear.split('-')[0]}-07-01`,
    endDate: `${programYear.split('-')[1]}-06-30`,
    lastUpdated: new Date().toISOString(),
    dataPoints: dataPoints.map(dp => ({
      ...dp,
      snapshotId: dp.date,
      payments: dp.payments ?? 0,
      dcpGoals: 0,
      clubCounts: {
        ...dp.clubCounts,
        vulnerable: 0,
        interventionRequired: 0,
      },
    })),
    summary: {
      totalDataPoints: dataPoints.length,
      membershipStart: dataPoints[0]?.membership ?? 0,
      membershipEnd: dataPoints[dataPoints.length - 1]?.membership ?? 0,
      membershipPeak: Math.max(...dataPoints.map(d => d.membership), 0),
      membershipLow: Math.min(...dataPoints.map(d => d.membership), 0),
    },
  }
}

/**
 * A district id that survived 2026-07-01 and absorbed a neighbour:
 * 96 → 168 clubs, membership 1600 → 2900.
 */
function mergedDistrict(): TimeSeriesData {
  return {
    currentProgramYear: '2026-2027',
    years: {
      '2026-2027': makeProgramYear('2026-2027', [
        {
          date: '2026-11-30',
          membership: 2900,
          payments: 2810,
          distinguishedTotal: 44,
          clubCounts: { total: 168, thriving: 70 },
        },
      ]),
      '2025-2026': makeProgramYear('2025-2026', [
        {
          date: '2025-11-30',
          membership: 1600,
          payments: 1540,
          distinguishedTotal: 22,
          clubCounts: { total: 96, thriving: 39 },
        },
      ]),
    },
    availableYears: ['2026-2027', '2025-2026'],
    baseMembership: 2850,
    currentMembership: 2900,
    memberChange: 50,
  }
}

/**
 * The same boundary, but a district whose roster barely moved: 96 → 93.
 */
function stableDistrict(): TimeSeriesData {
  return {
    currentProgramYear: '2026-2027',
    years: {
      '2026-2027': makeProgramYear('2026-2027', [
        {
          date: '2026-11-30',
          membership: 1655,
          payments: 1602,
          distinguishedTotal: 24,
          clubCounts: { total: 93, thriving: 40 },
        },
      ]),
      '2025-2026': makeProgramYear('2025-2026', [
        {
          date: '2025-11-30',
          membership: 1600,
          payments: 1540,
          distinguishedTotal: 22,
          clubCounts: { total: 96, thriving: 39 },
        },
      ]),
    },
    availableYears: ['2026-2027', '2025-2026'],
    baseMembership: 1640,
    currentMembership: 1655,
    memberChange: 15,
  }
}

/** The same discontinuous jump, one program year earlier. */
function ordinaryYear(): TimeSeriesData {
  return {
    currentProgramYear: '2025-2026',
    years: {
      '2025-2026': makeProgramYear('2025-2026', [
        {
          date: '2025-11-30',
          membership: 2900,
          payments: 2810,
          distinguishedTotal: 44,
          clubCounts: { total: 168, thriving: 70 },
        },
      ]),
      '2024-2025': makeProgramYear('2024-2025', [
        {
          date: '2024-11-30',
          membership: 1600,
          payments: 1540,
          distinguishedTotal: 22,
          clubCounts: { total: 96, thriving: 39 },
        },
      ]),
    },
    availableYears: ['2025-2026', '2024-2025'],
    baseMembership: 2850,
    currentMembership: 2900,
    memberChange: 50,
  }
}

describe('detectTimeSeriesReformationDiscontinuity', () => {
  it('flags the pair the year-over-year functions would actually compare', () => {
    const result = detectTimeSeriesReformationDiscontinuity(mergedDistrict())

    expect(result?.isDiscontinuous).toBe(true)
    expect(result?.message).toBe(DISTRICT_REFORMATION_NOTICE)
  })

  it('does not flag a stable roster across the same boundary', () => {
    expect(
      detectTimeSeriesReformationDiscontinuity(stableDistrict())
        ?.isDiscontinuous
    ).toBe(false)
  })

  it('does not flag a comparison that never touches the boundary', () => {
    expect(
      detectTimeSeriesReformationDiscontinuity(ordinaryYear())?.isDiscontinuous
    ).toBe(false)
  })

  it('returns null when there is no comparable pair at all', () => {
    expect(detectTimeSeriesReformationDiscontinuity(null)).toBeNull()
  })
})

describe('computeYearOverYear across the reformation', () => {
  it('suppresses the figure for a district that annexed rather than grew', () => {
    expect(computeYearOverYear(mergedDistrict())).toBeNull()
  })

  it('still computes for a stable roster across the boundary', () => {
    const result = computeYearOverYear(stableDistrict())

    expect(result).not.toBeNull()
    // 1600 → 1655 is +3.4%, the district's real growth.
    expect(result?.membershipChange).toBeCloseTo(3.4, 1)
  })

  it('leaves an ordinary year-over-year comparison untouched', () => {
    const result = computeYearOverYear(ordinaryYear())

    expect(result).not.toBeNull()
    expect(result?.membershipChange).toBeCloseTo(81.3, 1)
  })
})

describe('computePaymentYoYFromTimeSeries across the reformation', () => {
  it('suppresses the payment figure for a merged district', () => {
    expect(computePaymentYoYFromTimeSeries(mergedDistrict())).toBeNull()
  })

  it('still computes payments for a stable roster across the boundary', () => {
    const result = computePaymentYoYFromTimeSeries(stableDistrict())

    expect(result?.yearOverYearChange).toBe(62)
    expect(result?.trendDirection).toBe('up')
  })

  it('leaves an ordinary payment comparison untouched', () => {
    expect(
      computePaymentYoYFromTimeSeries(ordinaryYear())?.yearOverYearChange
    ).toBe(1270)
  })
})
