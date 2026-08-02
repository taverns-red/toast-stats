/**
 * Unit tests for multi-year data flow in usePaymentsTrend
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.3, 3.3**
 *
 * Tests the usePaymentsTrend hook's behavior when useDistrictAnalytics
 * returns varying amounts of payment data across program years.
 * Verifies multi-year grouping, year capping, selectedProgramYear behavior,
 * and year-over-year change calculations.
 *
 * Requirement 1.1: The hook SHALL use multi-year data from useDistrictAnalytics
 * Requirement 1.2: The hook SHALL include data from up to 3 program years
 * Requirement 2.1: currentPayments derived from performanceTargets
 * Requirement 2.2: YoY change compares current vs closest matching previous year day
 * Requirement 2.3: No previous year data within 7 days → YoY change is null
 * Requirement 3.3: selectedProgramYear determines current year for grouping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { getProgramYear } from '../../utils/programYear'
import type {
  DistrictAnalytics,
  DistrictPerformanceTargets,
} from '../useDistrictAnalytics'
import type { UseQueryResult } from '@tanstack/react-query'

// Mock useDistrictAnalytics at the module level
vi.mock('../useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
}))

// Import after mocking so we get the mocked version
import { useDistrictAnalytics } from '../useDistrictAnalytics'
import { usePaymentsTrend } from '../usePaymentsTrend'
import { snap } from '../../test-utils/snapshotDate'

const mockedUseDistrictAnalytics = vi.mocked(useDistrictAnalytics)

// ========== Test Data Factories ==========

/**
 * Create minimal performance targets with specified membership payments values.
 */
function makePerformanceTargets(
  currentPayments: number,
  basePayments: number | null
): DistrictPerformanceTargets {
  const defaultRankings = {
    worldRank: null,
    worldPercentile: null,
    regionRank: null,
    totalDistricts: 100,
    totalInRegion: 10,
    region: null,
  }
  const defaultMetric: {
    current: number
    base: null
    targets: null
    achievedLevel: null
    rankings: typeof defaultRankings
  } = {
    current: 0,
    base: null,
    targets: null,
    achievedLevel: null,
    rankings: defaultRankings,
  }
  return {
    paidClubs: { ...defaultMetric },
    membershipPayments: {
      ...defaultMetric,
      current: currentPayments,
      base: basePayments,
    },
    distinguishedClubs: { ...defaultMetric },
  }
}

/**
 * Create a minimal DistrictAnalytics response with the given paymentsTrend
 * and optional performanceTargets.
 */
function makeAnalyticsData(
  paymentsTrend: Array<{ date: string; payments: number }>,
  performanceTargets?: DistrictPerformanceTargets
): DistrictAnalytics {
  return {
    districtId: '42',
    dateRange: { start: '2022-07-01', end: '2025-01-15' },
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

/**
 * Configure the mocked useDistrictAnalytics to return the given analytics data.
 */
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

// ========== Tests ==========

describe('usePaymentsTrend — Multi-Year Data Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * When useDistrictAnalytics returns 3 years of payment data,
   * multiYearData should contain 3 year groups: 1 current + 2 previous.
   */
  describe('3 years of payment data produces 3 year groups', () => {
    it('should produce multiYearData with currentYear and 2 previousYears', () => {
      const selectedYear = getProgramYear(2024) // "2024-2025"
      const paymentsTrend = [
        // 2022-2023 program year
        { date: '2022-09-15', payments: 40 },
        { date: '2023-01-10', payments: 90 },
        // 2023-2024 program year
        { date: '2023-08-20', payments: 55 },
        { date: '2024-02-15', payments: 150 },
        // 2024-2025 program year (current)
        { date: '2024-10-01', payments: 70 },
        { date: '2025-01-05', payments: 200 },
      ]

      mockDistrictAnalytics(
        makeAnalyticsData(paymentsTrend, makePerformanceTargets(200, 180))
      )

      const { result } = renderHook(() =>
        usePaymentsTrend('42', undefined, snap('2025-01-15'), selectedYear)
      )

      expect(result.current.data).not.toBeNull()
      const multiYear = result.current.data!.multiYearData
      expect(multiYear).not.toBeNull()
      expect(multiYear!.currentYear.label).toBe('2024-2025')
      expect(multiYear!.currentYear.data).toHaveLength(2)
      expect(multiYear!.previousYears).toHaveLength(2)

      const previousLabels = multiYear!.previousYears.map(y => y.label)
      expect(previousLabels).toContain('2023-2024')
      expect(previousLabels).toContain('2022-2023')
    })
  })

  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * When useDistrictAnalytics returns only 1 year of data,
   * multiYearData should have the current year with empty previousYears.
   */
  describe('1 year of data produces current year only with empty previousYears', () => {
    it('should produce multiYearData with currentYear and no previousYears', () => {
      const selectedYear = getProgramYear(2024) // "2024-2025"
      const paymentsTrend = [
        // Only 2024-2025 program year data
        { date: '2024-08-15', payments: 30 },
        { date: '2024-11-20', payments: 100 },
        { date: '2025-01-10', payments: 180 },
      ]

      mockDistrictAnalytics(
        makeAnalyticsData(paymentsTrend, makePerformanceTargets(180, 160))
      )

      const { result } = renderHook(() =>
        usePaymentsTrend('42', undefined, snap('2025-01-15'), selectedYear)
      )

      expect(result.current.data).not.toBeNull()
      const multiYear = result.current.data!.multiYearData
      expect(multiYear).not.toBeNull()
      expect(multiYear!.currentYear.label).toBe('2024-2025')
      expect(multiYear!.currentYear.data).toHaveLength(3)
      expect(multiYear!.previousYears).toHaveLength(0)
    })
  })

  /**
   * **Validates: Requirement 1.2**
   *
   * When useDistrictAnalytics returns 5 years of data,
   * multiYearData should be capped at 3 years (the most recent).
   */
  describe('5 years of data is capped at 3 years (most recent)', () => {
    it('should include only the 3 most recent program years', () => {
      const selectedYear = getProgramYear(2024) // "2024-2025"
      const paymentsTrend = [
        // 2020-2021 program year (should be excluded)
        { date: '2020-10-01', payments: 10 },
        // 2021-2022 program year (should be excluded)
        { date: '2021-10-01', payments: 20 },
        // 2022-2023 program year (included — 3rd most recent)
        { date: '2022-10-01', payments: 30 },
        // 2023-2024 program year (included — 2nd most recent)
        { date: '2023-10-01', payments: 40 },
        // 2024-2025 program year (included — most recent / current)
        { date: '2024-10-01', payments: 50 },
      ]

      mockDistrictAnalytics(
        makeAnalyticsData(paymentsTrend, makePerformanceTargets(50, 45))
      )

      const { result } = renderHook(() =>
        usePaymentsTrend('42', undefined, snap('2025-01-15'), selectedYear)
      )

      expect(result.current.data).not.toBeNull()
      const multiYear = result.current.data!.multiYearData
      expect(multiYear).not.toBeNull()

      // Current year + 2 previous = 3 total
      expect(multiYear!.currentYear.label).toBe('2024-2025')
      expect(multiYear!.previousYears).toHaveLength(2)

      const allLabels = [
        multiYear!.currentYear.label,
        ...multiYear!.previousYears.map(y => y.label),
      ]
      // Should contain the 3 most recent years
      expect(allLabels).toContain('2024-2025')
      expect(allLabels).toContain('2023-2024')
      expect(allLabels).toContain('2022-2023')
      // Should NOT contain older years
      expect(allLabels).not.toContain('2021-2022')
      expect(allLabels).not.toContain('2020-2021')
    })
  })

  /**
   * **Validates: Requirement 3.3**
   *
   * When selectedProgramYear is provided, it determines which year
   * is treated as currentYear vs previousYears in multiYearData.
   */
  describe('selectedProgramYear determines currentYear vs previousYears', () => {
    it('should use selectedProgramYear as currentYear label', () => {
      const paymentsTrend = [
        // 2022-2023
        { date: '2022-09-01', payments: 30 },
        // 2023-2024
        { date: '2023-09-01', payments: 60 },
        // 2024-2025
        { date: '2024-09-01', payments: 90 },
      ]

      // Select 2023-2024 as the current year (not the most recent)
      const selectedYear = getProgramYear(2023) // "2023-2024"
      mockDistrictAnalytics(
        makeAnalyticsData(paymentsTrend, makePerformanceTargets(90, 80))
      )

      const { result } = renderHook(() =>
        usePaymentsTrend('42', undefined, snap('2025-01-15'), selectedYear)
      )

      expect(result.current.data).not.toBeNull()
      const multiYear = result.current.data!.multiYearData
      expect(multiYear).not.toBeNull()

      // currentYear should be the selected year, not the most recent
      expect(multiYear!.currentYear.label).toBe('2023-2024')
      expect(multiYear!.currentYear.data).toHaveLength(1)

      // previousYears should contain the other years
      const previousLabels = multiYear!.previousYears.map(y => y.label)
      expect(previousLabels).toContain('2024-2025')
      expect(previousLabels).toContain('2022-2023')
      expect(previousLabels).not.toContain('2023-2024')
    })

    it('should produce different groupings for different selectedProgramYear values', () => {
      const paymentsTrend = [
        { date: '2022-09-01', payments: 30 },
        { date: '2023-09-01', payments: 60 },
        { date: '2024-09-01', payments: 90 },
      ]

      // First: select 2024-2025
      const year2024 = getProgramYear(2024)
      mockDistrictAnalytics(
        makeAnalyticsData(paymentsTrend, makePerformanceTargets(90, 80))
      )

      const { result: result1 } = renderHook(() =>
        usePaymentsTrend('42', undefined, snap('2025-01-15'), year2024)
      )

      // Second: select 2022-2023
      const year2022 = getProgramYear(2022)
      const { result: result2 } = renderHook(() =>
        usePaymentsTrend('42', undefined, snap('2025-01-15'), year2022)
      )

      expect(result1.current.data!.multiYearData!.currentYear.label).toBe(
        '2024-2025'
      )
      expect(result2.current.data!.multiYearData!.currentYear.label).toBe(
        '2022-2023'
      )
    })
  })

  /**
   * **Validates: Requirement 2.2**
   *
   * When previous year data exists within 7 days of the current program year day,
   * yearOverYearChange should produce the correct change value.
   */
  describe('YoY change: previous year data within 7 days produces correct change', () => {
    it('should calculate yearOverYearChange when previous year has matching data', () => {
      const selectedYear = getProgramYear(2024) // "2024-2025"

      // Current year: last point at programYearDay ~92 (Oct 1 = ~92 days from Jul 1)
      // Previous year: point at programYearDay ~92 (Oct 1 of previous year)
      // These should be within 7 days of each other
      const paymentsTrend = [
        // 2023-2024: Oct 1, 2023 → programYearDay ~92
        { date: '2023-10-01', payments: 80 },
        // 2024-2025: Oct 1, 2024 → programYearDay ~92
        { date: '2024-10-01', payments: 120 },
      ]

      // performanceTargets.membershipPayments.current = 120 (current YTD)
      mockDistrictAnalytics(
        makeAnalyticsData(paymentsTrend, makePerformanceTargets(120, 100))
      )

      const { result } = renderHook(() =>
        usePaymentsTrend('42', undefined, snap('2025-01-15'), selectedYear)
      )

      expect(result.current.data).not.toBeNull()
      const stats = result.current.data!.statistics

      // YoY change: currentPayments (120) - previousPayments at matching day (80) = 40
      expect(stats.yearOverYearChange).toBe(40)
      expect(stats.trendDirection).toBe('up')
    })
  })

  /**
   * **Validates: Requirement 2.3**
   *
   * When no previous year data exists within 7 days of the current program year day,
   * yearOverYearChange should be null.
   */
  describe('YoY change: no previous year data within 7 days produces null', () => {
    it('should return null yearOverYearChange when no previous year data is close enough', () => {
      const selectedYear = getProgramYear(2024) // "2024-2025"

      // Current year: last point at programYearDay ~92 (Oct 1)
      // Previous year: point at programYearDay ~214 (Jan 31) — far from day 92
      const paymentsTrend = [
        // 2023-2024: Jan 31, 2024 → programYearDay ~214 (far from Oct 1's ~92)
        { date: '2024-01-31', payments: 150 },
        // 2024-2025: Oct 1, 2024 → programYearDay ~92
        { date: '2024-10-01', payments: 120 },
      ]

      mockDistrictAnalytics(
        makeAnalyticsData(paymentsTrend, makePerformanceTargets(120, 100))
      )

      const { result } = renderHook(() =>
        usePaymentsTrend('42', undefined, snap('2025-01-15'), selectedYear)
      )

      expect(result.current.data).not.toBeNull()
      const stats = result.current.data!.statistics

      // No previous year data within 7 days of programYearDay ~92
      expect(stats.yearOverYearChange).toBeNull()
      expect(stats.trendDirection).toBeNull()
    })

    it('should return null yearOverYearChange when no previous year data exists at all', () => {
      const selectedYear = getProgramYear(2024) // "2024-2025"

      // Only current year data, no previous years
      const paymentsTrend = [{ date: '2024-10-01', payments: 120 }]

      mockDistrictAnalytics(
        makeAnalyticsData(paymentsTrend, makePerformanceTargets(120, 100))
      )

      const { result } = renderHook(() =>
        usePaymentsTrend('42', undefined, snap('2025-01-15'), selectedYear)
      )

      expect(result.current.data).not.toBeNull()
      const stats = result.current.data!.statistics

      expect(stats.yearOverYearChange).toBeNull()
      expect(stats.trendDirection).toBeNull()
    })
  })
})
