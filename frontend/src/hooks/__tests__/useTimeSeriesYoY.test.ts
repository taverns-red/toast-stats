/**
 * Tests for computeYearOverYear (#170)
 */

import { describe, it, expect } from 'vitest'
import { computeYearOverYear } from '../useTimeSeriesYoY'
import type { TimeSeriesData } from '../useTimeSeries'
import type { ProgramYearIndexFile } from '@toastmasters/shared-contracts'

function makeProgramYear(
  programYear: string,
  dataPoints: Array<{
    date: string
    membership: number
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
      payments: 0,
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

describe('computeYearOverYear', () => {
  it('returns null when timeSeries is null', () => {
    expect(computeYearOverYear(null)).toBeNull()
  })

  it('returns null when no prior year data', () => {
    const ts: TimeSeriesData = {
      currentProgramYear: '2025-2026',
      years: {
        '2025-2026': makeProgramYear('2025-2026', [
          {
            date: '2026-03-24',
            membership: 2815,
            distinguishedTotal: 45,
            clubCounts: { total: 167, thriving: 68 },
          },
        ]),
      },
      availableYears: ['2025-2026'],
      baseMembership: 2794,
      currentMembership: 2815,
      memberChange: 21,
    }

    expect(computeYearOverYear(ts)).toBeNull()
  })

  it('computes correct percentage changes with prior year data', () => {
    const ts: TimeSeriesData = {
      currentProgramYear: '2025-2026',
      years: {
        '2025-2026': makeProgramYear('2025-2026', [
          {
            date: '2025-07-31',
            membership: 2794,
            distinguishedTotal: 1,
            clubCounts: { total: 164, thriving: 31 },
          },
          {
            date: '2026-03-24',
            membership: 2815,
            distinguishedTotal: 45,
            clubCounts: { total: 167, thriving: 68 },
          },
        ]),
        '2024-2025': makeProgramYear('2024-2025', [
          {
            date: '2025-03-22',
            membership: 2700,
            distinguishedTotal: 40,
            clubCounts: { total: 170, thriving: 60 },
          },
          {
            date: '2025-06-30',
            membership: 2737,
            distinguishedTotal: 63,
            clubCounts: { total: 170, thriving: 78 },
          },
        ]),
      },
      availableYears: ['2025-2026', '2024-2025'],
      baseMembership: 2737,
      currentMembership: 2815,
      memberChange: 78,
    }

    const result = computeYearOverYear(ts)
    expect(result).not.toBeNull()

    // Membership: 2815 vs 2700 (closest match to Mar 24 is Mar 22)
    // (2815 - 2700) / 2700 * 100 = 4.259...
    expect(result!.membershipChange).toBeCloseTo(4.3, 0)

    // Distinguished: 45 vs 40
    // (45 - 40) / 40 * 100 = 12.5
    expect(result!.distinguishedChange).toBeCloseTo(12.5, 0)

    // Club health: thriving% — 68/167≈40.7% vs 60/170≈35.3%
    // Change: (40.7 - 35.3) / 35.3 * 100 ≈ 15.3%
    expect(result!.clubHealthChange).toBeGreaterThan(0)
  })

  it('handles prior year with zero membership gracefully', () => {
    const ts: TimeSeriesData = {
      currentProgramYear: '2025-2026',
      years: {
        '2025-2026': makeProgramYear('2025-2026', [
          {
            date: '2026-03-24',
            membership: 100,
            distinguishedTotal: 5,
            clubCounts: { total: 10, thriving: 3 },
          },
        ]),
        '2024-2025': makeProgramYear('2024-2025', [
          {
            date: '2025-03-24',
            membership: 0,
            distinguishedTotal: 0,
            clubCounts: { total: 0, thriving: 0 },
          },
        ]),
      },
      availableYears: ['2025-2026', '2024-2025'],
      baseMembership: 0,
      currentMembership: 100,
      memberChange: 100,
    }

    const result = computeYearOverYear(ts)
    expect(result).not.toBeNull()
    expect(result!.membershipChange).toBe(100) // 100% when previous is 0
  })

  it('returns null when prior year has no close date match', () => {
    const ts: TimeSeriesData = {
      currentProgramYear: '2025-2026',
      years: {
        '2025-2026': makeProgramYear('2025-2026', [
          {
            date: '2026-03-24',
            membership: 2815,
            distinguishedTotal: 45,
            clubCounts: { total: 167, thriving: 68 },
          },
        ]),
        '2024-2025': makeProgramYear('2024-2025', [
          {
            // Only July data — 8+ months away from March
            date: '2024-07-31',
            membership: 2700,
            distinguishedTotal: 40,
            clubCounts: { total: 170, thriving: 60 },
          },
        ]),
      },
      availableYears: ['2025-2026', '2024-2025'],
      baseMembership: 2700,
      currentMembership: 2815,
      memberChange: 115,
    }

    // Should return null since Jul 31 is too far from Mar 24 (>30 days)
    const result = computeYearOverYear(ts)
    expect(result).toBeNull()
  })
})
