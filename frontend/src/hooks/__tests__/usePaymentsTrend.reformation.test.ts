/**
 * usePaymentsTrend across the 2026 district reformation (#1442).
 *
 * Site 3 of 4. This hook computes its own payment year-over-year from the
 * analytics `paymentsTrend`, which carries dates and payments but no club
 * counts — so it cannot detect the discontinuity itself. The page already
 * holds the signal (it fetches the time series, which does carry club counts
 * per year), so it is passed down as a parameter rather than re-derived here.
 * That is R3: the parent owns the context; the child does not guess it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { getProgramYear } from '../../utils/programYear'
import {
  detectReformationDiscontinuity,
  DISTRICT_REFORMATION_NOTICE,
} from '@taverns-red/shared-contracts'
import type {
  DistrictAnalytics,
  DistrictPerformanceTargets,
} from '../useDistrictAnalytics'
import type { UseQueryResult } from '@tanstack/react-query'

vi.mock('../useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
}))

import { useDistrictAnalytics } from '../useDistrictAnalytics'
import { usePaymentsTrend } from '../usePaymentsTrend'
import { snap } from '../../test-utils/snapshotDate'

const mockedUseDistrictAnalytics = vi.mocked(useDistrictAnalytics)

function makePerformanceTargets(
  currentPayments: number,
  basePayments: number | null
): DistrictPerformanceTargets {
  const rankings = {
    worldRank: null,
    worldPercentile: null,
    regionRank: null,
    totalDistricts: 100,
    totalInRegion: 10,
    region: null,
  }
  const metric = {
    current: 0,
    base: null,
    targets: null,
    achievedLevel: null,
    rankings,
  }
  return {
    paidClubs: { ...metric },
    membershipPayments: {
      ...metric,
      current: currentPayments,
      base: basePayments,
    },
    distinguishedClubs: { ...metric },
  } as DistrictPerformanceTargets
}

function makeAnalyticsData(
  paymentsTrend: Array<{ date: string; payments: number }>,
  performanceTargets?: DistrictPerformanceTargets
): DistrictAnalytics {
  return {
    districtId: '61',
    dateRange: { start: '2024-07-01', end: '2026-11-30' },
    totalMembership: 5000,
    membershipChange: 100,
    membershipTrend: [],
    paymentsTrend,
    topGrowthClubs: [],
    allClubs: [],
    vulnerableClubs: [],
    thrivingClubs: [],
    interventionRequiredClubs: [],
    distinguishedClubs: {
      smedley: 0,
      presidents: 0,
      select: 0,
      distinguished: 0,
      total: 0,
    },
    distinguishedProjection: 0,
    divisionRankings: [],
    topPerformingAreas: [],
    prospectiveClubs: [],
    performanceTargets,
  }
}

function mockDistrictAnalytics(data: DistrictAnalytics): void {
  mockedUseDistrictAnalytics.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    isError: false,
    isPending: false,
    isSuccess: true,
    status: 'success',
    fetchStatus: 'idle',
    isFetching: false,
    refetch: vi.fn(),
  } as unknown as UseQueryResult<DistrictAnalytics, Error>)
}

/** Payments straddling 2026-07-01, matched to the same program-year day. */
const acrossBoundaryTrend = [
  { date: '2025-11-30', payments: 1540 },
  { date: '2026-11-30', payments: 2810 },
]

const mergedDistrict = detectReformationDiscontinuity({
  previousDate: '2025-11-30',
  currentDate: '2026-11-30',
  previousCount: 96,
  currentCount: 168,
})

const stableDistrict = detectReformationDiscontinuity({
  previousDate: '2025-11-30',
  currentDate: '2026-11-30',
  previousCount: 96,
  currentCount: 93,
})

describe('usePaymentsTrend across the 2026 reformation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('suppresses the payment YoY when the parent reports a roster discontinuity', () => {
    mockDistrictAnalytics(
      makeAnalyticsData(acrossBoundaryTrend, makePerformanceTargets(2810, 2700))
    )

    const { result } = renderHook(() =>
      usePaymentsTrend(
        '61',
        undefined,
        snap('2026-11-30'),
        getProgramYear(2026),
        null,
        mergedDistrict
      )
    )

    const stats = result.current.data!.statistics
    expect(stats.yearOverYearChange).toBeNull()
    expect(stats.trendDirection).toBeNull()
    expect(stats.yearOverYearUnavailableReason).toBe(
      DISTRICT_REFORMATION_NOTICE
    )
    // The current-year figure itself is still real and still shown.
    expect(stats.currentPayments).toBe(2810)
  })

  it('still computes the payment YoY for a stable roster across the boundary', () => {
    mockDistrictAnalytics(
      makeAnalyticsData(acrossBoundaryTrend, makePerformanceTargets(2810, 2700))
    )

    const { result } = renderHook(() =>
      usePaymentsTrend(
        '61',
        undefined,
        snap('2026-11-30'),
        getProgramYear(2026),
        null,
        stableDistrict
      )
    )

    const stats = result.current.data!.statistics
    expect(stats.yearOverYearChange).toBe(1270)
    expect(stats.trendDirection).toBe('up')
    expect(stats.yearOverYearUnavailableReason).toBeNull()
  })

  it('is inert when no discontinuity is supplied at all', () => {
    mockDistrictAnalytics(
      makeAnalyticsData(acrossBoundaryTrend, makePerformanceTargets(2810, 2700))
    )

    const { result } = renderHook(() =>
      usePaymentsTrend(
        '61',
        undefined,
        snap('2026-11-30'),
        getProgramYear(2026),
        null
      )
    )

    const stats = result.current.data!.statistics
    expect(stats.yearOverYearChange).toBe(1270)
    expect(stats.yearOverYearUnavailableReason).toBeNull()
  })
})
