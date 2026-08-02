/**
 * Unit tests for useAggregatedAnalytics hook
 * Feature: district-analytics-performance
 *
 * Validates: Requirements 5.1
 *
 * These tests verify that the useAggregatedAnalytics hook correctly:
 * - Fetches analytics from CDN (no Express fallback — #173)
 * - Converts CDN format to aggregated response format
 * - Handles loading and error states appropriately
 * - Populates yearOverYear from CDN data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { useAggregatedAnalytics } from '../useAggregatedAnalytics'
import {
  fetchLatestSnapshotDate,
  cdnAnalyticsUrl,
  fetchFromCdn,
} from '../../services/cdn'
import { toSnapshotDate } from '../../types/snapshotDate'
import type { DistrictAnalytics } from '../useDistrictAnalytics'

// Mock the CDN client — CDN fetch resolves with test data.
vi.mock('../../services/cdn', () => ({
  fetchLatestSnapshotDate: vi.fn(),
  cdnAnalyticsUrl: vi.fn(),
  fetchFromCdn: vi.fn(),
}))

// ========== Test Data Factories ==========

const createMockCdnAnalytics = (
  overrides: Partial<DistrictAnalytics> = {}
): DistrictAnalytics => ({
  districtId: '42',
  dateRange: {
    start: '2024-07-01',
    end: '2024-12-31',
  },
  totalMembership: 5000,
  membershipChange: 150,
  membershipTrend: [
    { date: '2024-07-01', count: 4850 },
    { date: '2024-08-01', count: 4900 },
  ],
  paymentsTrend: [
    { date: '2024-07-01', payments: 100 },
    { date: '2024-08-01', payments: 120 },
  ],
  topGrowthClubs: [],
  allClubs: [],
  vulnerableClubs: [
    {
      clubId: 'club1',
      clubName: 'Test Club 1',
      divisionId: 'A',
      divisionName: 'Division A',
      areaId: 'A1',
      areaName: 'Area A1',
      membershipTrend: [],
      dcpGoalsTrend: [],
      currentStatus: 'vulnerable',
      riskFactors: [],
      distinguishedLevel: 'NotDistinguished',
    },
  ],
  thrivingClubs: [
    {
      clubId: 'club2',
      clubName: 'Test Club 2',
      divisionId: 'B',
      divisionName: 'Division B',
      areaId: 'B1',
      areaName: 'Area B1',
      membershipTrend: [],
      dcpGoalsTrend: [],
      currentStatus: 'thriving',
      riskFactors: [],
      distinguishedLevel: 'Distinguished',
    },
  ],
  interventionRequiredClubs: [],
  distinguishedClubs: {
    smedley: 5,
    presidents: 10,
    select: 15,
    distinguished: 20,
    total: 50,
  },
  distinguishedProjection: 65,
  divisionRankings: [],
  topPerformingAreas: [],
  yearOverYear: {
    membershipChange: 5.2,
    distinguishedChange: 10.5,
    clubHealthChange: 3.1,
  },
  prospectiveClubs: [],
  ...overrides,
})

// Create a wrapper with QueryClientProvider for testing hooks
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('useAggregatedAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set up CDN mocks for each test
    // The hook resolves "latest" via the branded mint helper now, not the raw
    // manifest (#1323).
    vi.mocked(fetchLatestSnapshotDate).mockResolvedValue(
      toSnapshotDate('2024-12-15')!
    )
    vi.mocked(cdnAnalyticsUrl).mockReturnValue(
      'https://cdn.taverns.red/snapshots/2024-12-15/analytics/district_42_analytics.json'
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('CDN-only fetch (#173)', () => {
    /**
     * Test that hook fetches analytics from CDN
     *
     * **Validates: Requirements 5.1**
     */
    it('should fetch analytics from CDN and convert to aggregated format', async () => {
      const mockAnalytics = createMockCdnAnalytics()
      vi.mocked(fetchFromCdn).mockResolvedValue({ data: mockAnalytics })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data).not.toBeNull()
      expect(result.current.data?.districtId).toBe('42')
      expect(result.current.data?.summary.totalMembership).toBe(5000)
      expect(result.current.data?.dataSource).toBe('computed')
      // usedFallback is always true (CDN is sole source)
      expect(result.current.usedFallback).toBe(true)
    })

    /**
     * Test that hook returns complete data with all fields populated
     */
    it('should return complete aggregated analytics data from CDN', async () => {
      const mockAnalytics = createMockCdnAnalytics()
      vi.mocked(fetchFromCdn).mockResolvedValue({ data: mockAnalytics })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const data = result.current.data
      expect(data).not.toBeNull()

      // Verify summary data (computed from CDN club arrays)
      expect(data?.summary.totalMembership).toBe(5000)
      expect(data?.summary.membershipChange).toBe(150)
      expect(data?.summary.clubCounts.total).toBe(2) // 1 vulnerable + 1 thriving
      expect(data?.summary.clubCounts.thriving).toBe(1)
      expect(data?.summary.clubCounts.vulnerable).toBe(1)
      expect(data?.summary.clubCounts.interventionRequired).toBe(0)
      expect(data?.summary.distinguishedClubs.total).toBe(50)
      expect(data?.summary.distinguishedProjection).toBe(65)

      // Verify trends data
      expect(data?.trends.membership).toHaveLength(2)
      expect(data?.trends.payments).toHaveLength(2)

      // Verify year-over-year data populated from CDN (#173)
      expect(data?.yearOverYear?.membershipChange).toBe(5.2)
      expect(data?.yearOverYear?.distinguishedChange).toBe(10.5)
    })

    /**
     * Test that hook does not fetch when districtId is null
     */
    it('should not fetch when districtId is null', async () => {
      const { result } = renderHook(() => useAggregatedAnalytics(null), {
        wrapper: createWrapper(),
      })

      // Wait a bit to ensure no fetch happens
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(fetchFromCdn).not.toHaveBeenCalled()
      expect(result.current.data).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Error handling', () => {
    /**
     * Test that hook reports error when CDN fails
     */
    it('should report error when CDN fails', async () => {
      vi.mocked(fetchLatestSnapshotDate).mockRejectedValue(
        new Error('CDN unavailable')
      )

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false)
        },
        { timeout: 5000 }
      )

      expect(result.current.isError).toBe(true)
      expect(result.current.data).toBeNull()
      expect(result.current.error).not.toBeNull()
    })

    /**
     * Test that hook reports error when CDN file fetch fails
     */
    it('should report error when analytics file fetch fails', async () => {
      vi.mocked(fetchFromCdn).mockRejectedValue(
        new Error('CDN fetch failed: 404')
      )

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false)
        },
        { timeout: 5000 }
      )

      expect(result.current.isError).toBe(true)
      expect(result.current.data).toBeNull()
    })
  })

  describe('Loading states', () => {
    /**
     * Test initial loading state
     */
    it('should show loading state initially', () => {
      vi.mocked(fetchFromCdn).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toBeNull()
    })

    /**
     * Test that loading completes when data is fetched
     */
    it('should complete loading when data is fetched', async () => {
      const mockAnalytics = createMockCdnAnalytics()
      vi.mocked(fetchFromCdn).mockResolvedValue({ data: mockAnalytics })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data).not.toBeNull()
    })
  })

  describe('Data without optional fields', () => {
    /**
     * Test handling CDN response without yearOverYear data
     */
    it('should handle CDN response without yearOverYear data', async () => {
      const mockAnalytics = createMockCdnAnalytics({
        yearOverYear: undefined,
      })
      vi.mocked(fetchFromCdn).mockResolvedValue({ data: mockAnalytics })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data?.yearOverYear).toBeUndefined()
    })

    /**
     * Test handling CDN response without payments trend
     */
    it('should handle CDN response without payments trend', async () => {
      const mockAnalytics = createMockCdnAnalytics({
        paymentsTrend: undefined,
      })
      vi.mocked(fetchFromCdn).mockResolvedValue({ data: mockAnalytics })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data?.trends.payments).toBeUndefined()
      expect(result.current.data?.trends.membership).toHaveLength(2)
    })

    /**
     * Test handling distinguishedProjection as object from CDN
     *
     * The CDN analytics file may return distinguishedProjection as an object.
     * The conversion should extract the projectedDistinguished value.
     */
    it('should convert distinguishedProjection object to number', async () => {
      const mockAnalytics = createMockCdnAnalytics({
        distinguishedProjection: {
          projectedDistinguished: 30,
          currentDistinguished: 25,
          currentSelect: 18,
          currentPresident: 12,
          projectionDate: '2024-06-30',
        } as unknown as number,
      })
      vi.mocked(fetchFromCdn).mockResolvedValue({ data: mockAnalytics })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should have extracted projectedDistinguished value directly
      expect(result.current.data?.summary.distinguishedProjection).toBe(30)
    })
  })
})
