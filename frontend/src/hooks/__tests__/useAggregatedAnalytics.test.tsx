/**
 * Unit tests for useAggregatedAnalytics hook
 * Feature: district-analytics-performance
 *
 * Validates: Requirements 5.1
 *
 * These tests verify that the useAggregatedAnalytics hook correctly:
 * - Fetches aggregated analytics from GET /api/districts/:districtId/analytics-summary
 * - Falls back to individual endpoints if aggregated endpoint fails
 * - Handles loading and error states appropriately
 * - Supports optional startDate and endDate parameters
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useAggregatedAnalytics,
  AggregatedAnalyticsResponse,
} from '../useAggregatedAnalytics'
import { apiClient } from '../../services/api'
import type { DistrictAnalytics } from '../useDistrictAnalytics'

// Mock the API client
vi.mock('../../services/api', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

// Mock the CDN client — CDN fetch always fails in these tests,
// ensuring the Express fallback path is exercised cleanly.
vi.mock('../../services/cdn', () => ({
  fetchCdnManifest: vi.fn().mockRejectedValue(new Error('CDN unavailable')),
  cdnAnalyticsUrl: vi.fn(),
  fetchFromCdn: vi.fn().mockRejectedValue(new Error('CDN unavailable')),
}))

// Type the mocked apiClient
const mockedApiClient = vi.mocked(apiClient)

// ========== Test Data Factories ==========

const createMockAggregatedResponse = (
  overrides: Partial<AggregatedAnalyticsResponse> = {}
): AggregatedAnalyticsResponse => ({
  districtId: '42',
  dateRange: {
    start: '2024-07-01',
    end: '2024-12-31',
  },
  summary: {
    totalMembership: 5000,
    membershipChange: 150,
    clubCounts: {
      total: 100,
      thriving: 60,
      vulnerable: 30,
      interventionRequired: 10,
    },
    distinguishedClubs: {
      smedley: 5,
      presidents: 10,
      select: 15,
      distinguished: 20,
      total: 50,
    },
    distinguishedProjection: 65,
    ...overrides.summary,
  },
  trends: {
    membership: [
      { date: '2024-07-01', count: 4850 },
      { date: '2024-08-01', count: 4900 },
      { date: '2024-09-01', count: 4950 },
      { date: '2024-10-01', count: 5000 },
    ],
    payments: [
      { date: '2024-07-01', payments: 100 },
      { date: '2024-08-01', payments: 120 },
    ],
    ...overrides.trends,
  },
  yearOverYear: {
    membershipChange: 5.2,
    distinguishedChange: 10.5,
    clubHealthChange: 3.1,
    ...overrides.yearOverYear,
  },
  dataSource: 'precomputed',
  computedAt: '2024-12-15T10:30:00Z',
  ...overrides,
})

const createMockIndividualAnalyticsResponse = (
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
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Primary endpoint (aggregated)', () => {
    /**
     * Test that hook fetches from aggregated endpoint
     *
     * **Validates: Requirements 5.1**
     */
    it('should fetch aggregated analytics from /analytics-summary endpoint', async () => {
      const mockResponse = createMockAggregatedResponse()
      mockedApiClient.get.mockResolvedValue({ data: mockResponse })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        '/districts/42/analytics-summary'
      )
      expect(result.current.data).not.toBeNull()
      expect(result.current.data?.districtId).toBe('42')
      expect(result.current.data?.summary.totalMembership).toBe(5000)
      expect(result.current.data?.dataSource).toBe('precomputed')
      expect(result.current.usedFallback).toBe(false)
    })

    /**
     * Test that hook passes date parameters correctly
     *
     * **Validates: Requirements 5.1**
     */
    it('should pass startDate and endDate query parameters', async () => {
      const mockResponse = createMockAggregatedResponse()
      mockedApiClient.get.mockResolvedValue({ data: mockResponse })

      const { result } = renderHook(
        () => useAggregatedAnalytics('42', '2024-07-01', '2024-12-31'),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        '/districts/42/analytics-summary?startDate=2024-07-01&endDate=2024-12-31'
      )
    })

    /**
     * Test that hook handles only startDate parameter
     */
    it('should handle only startDate parameter', async () => {
      const mockResponse = createMockAggregatedResponse()
      mockedApiClient.get.mockResolvedValue({ data: mockResponse })

      const { result } = renderHook(
        () => useAggregatedAnalytics('42', '2024-07-01'),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        '/districts/42/analytics-summary?startDate=2024-07-01'
      )
    })

    /**
     * Test that hook returns all expected data fields
     */
    it('should return complete aggregated analytics data', async () => {
      const mockResponse = createMockAggregatedResponse()
      mockedApiClient.get.mockResolvedValue({ data: mockResponse })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const data = result.current.data
      expect(data).not.toBeNull()

      // Verify summary data
      expect(data?.summary.totalMembership).toBe(5000)
      expect(data?.summary.membershipChange).toBe(150)
      expect(data?.summary.clubCounts.total).toBe(100)
      expect(data?.summary.clubCounts.thriving).toBe(60)
      expect(data?.summary.clubCounts.vulnerable).toBe(30)
      expect(data?.summary.clubCounts.interventionRequired).toBe(10)
      expect(data?.summary.distinguishedClubs.total).toBe(50)
      expect(data?.summary.distinguishedProjection).toBe(65)

      // Verify trends data
      expect(data?.trends.membership).toHaveLength(4)
      expect(data?.trends.payments).toHaveLength(2)

      // Verify year-over-year data
      expect(data?.yearOverYear?.membershipChange).toBe(5.2)
      expect(data?.yearOverYear?.distinguishedChange).toBe(10.5)

      // Verify metadata
      expect(data?.dataSource).toBe('precomputed')
      expect(data?.computedAt).toBe('2024-12-15T10:30:00Z')
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

      expect(mockedApiClient.get).not.toHaveBeenCalled()
      expect(result.current.data).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Fallback to individual endpoints', () => {
    /**
     * Test that hook falls back to individual endpoint on aggregated failure
     *
     * **Validates: Requirements 5.1**
     */
    it('should fall back to individual endpoint when aggregated fails', async () => {
      const aggregatedError = new Error('Aggregated endpoint failed')
      const individualResponse = createMockIndividualAnalyticsResponse()

      // First call (aggregated) fails, second call (individual) succeeds
      mockedApiClient.get.mockImplementation((url: string) => {
        if (url.includes('analytics-summary')) {
          return Promise.reject(aggregatedError)
        }
        return Promise.resolve({ data: individualResponse })
      })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should have called both endpoints
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        '/districts/42/analytics-summary'
      )
      expect(mockedApiClient.get).toHaveBeenCalledWith(
        '/districts/42/analytics'
      )

      // Should have data from fallback
      expect(result.current.data).not.toBeNull()
      expect(result.current.data?.districtId).toBe('42')
      expect(result.current.usedFallback).toBe(true)
      expect(result.current.data?.dataSource).toBe('computed')
    })

    /**
     * Test that fallback converts individual response to aggregated format
     */
    it('should convert individual response to aggregated format', async () => {
      const aggregatedError = new Error('Aggregated endpoint failed')
      const individualResponse = createMockIndividualAnalyticsResponse()

      mockedApiClient.get.mockImplementation((url: string) => {
        if (url.includes('analytics-summary')) {
          return Promise.reject(aggregatedError)
        }
        return Promise.resolve({ data: individualResponse })
      })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const data = result.current.data
      expect(data).not.toBeNull()

      // Verify converted data structure
      expect(data?.summary.totalMembership).toBe(5000)
      expect(data?.summary.clubCounts.total).toBe(2) // 1 vulnerable + 1 thriving
      expect(data?.summary.clubCounts.thriving).toBe(1)
      expect(data?.summary.clubCounts.vulnerable).toBe(1)
      expect(data?.summary.clubCounts.interventionRequired).toBe(0)
      expect(data?.trends.membership).toHaveLength(2)
      expect(data?.yearOverYear?.membershipChange).toBe(5.2)
    })

    /**
     * Test that hook passes date parameters to fallback endpoint
     */
    it('should pass date parameters to fallback endpoint', async () => {
      const aggregatedError = new Error('Aggregated endpoint failed')
      const individualResponse = createMockIndividualAnalyticsResponse()

      mockedApiClient.get.mockImplementation((url: string) => {
        if (url.includes('analytics-summary')) {
          return Promise.reject(aggregatedError)
        }
        return Promise.resolve({ data: individualResponse })
      })

      const { result } = renderHook(
        () => useAggregatedAnalytics('42', '2024-07-01', '2024-12-31'),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockedApiClient.get).toHaveBeenCalledWith(
        '/districts/42/analytics?startDate=2024-07-01&endDate=2024-12-31'
      )
    })
  })

  describe('Error handling', () => {
    /**
     * Test that hook reports error when both endpoints fail with 404
     */
    it('should report error when both endpoints fail', async () => {
      // Use 404 error to avoid retries
      const error = {
        response: { status: 404 },
        message: 'Not found',
      }

      mockedApiClient.get.mockRejectedValue(error)

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isError).toBe(true)
      expect(result.current.data).toBeNull()
      expect(result.current.error).not.toBeNull()
    })

    /**
     * Test that hook does not retry on 404 errors
     */
    it('should not retry on 404 errors', async () => {
      const notFoundError = {
        response: { status: 404 },
        message: 'Not found',
      }

      mockedApiClient.get.mockRejectedValue(notFoundError)

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should have called twice (aggregated + fallback), no retries
      expect(mockedApiClient.get).toHaveBeenCalledTimes(2)
    })

    /**
     * Test that hook does not retry on 400 errors
     */
    it('should not retry on 400 errors', async () => {
      const badRequestError = {
        response: { status: 400 },
        message: 'Bad request',
      }

      mockedApiClient.get.mockRejectedValue(badRequestError)

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should have called twice (aggregated + fallback), no retries
      expect(mockedApiClient.get).toHaveBeenCalledTimes(2)
    })
  })

  describe('Loading states', () => {
    /**
     * Test initial loading state
     */
    it('should show loading state initially', () => {
      mockedApiClient.get.mockImplementation(
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
      const mockResponse = createMockAggregatedResponse()
      mockedApiClient.get.mockResolvedValue({ data: mockResponse })

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
     * Test handling response without yearOverYear data
     */
    it('should handle response without yearOverYear data', async () => {
      const mockResponse = createMockAggregatedResponse({
        yearOverYear: undefined,
      })
      mockedApiClient.get.mockResolvedValue({ data: mockResponse })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data?.yearOverYear).toBeUndefined()
    })

    /**
     * Test handling response without payments trend
     */
    it('should handle response without payments trend', async () => {
      const mockResponse = createMockAggregatedResponse({
        trends: {
          membership: [{ date: '2024-07-01', count: 5000 }],
          payments: undefined,
        },
      })
      mockedApiClient.get.mockResolvedValue({ data: mockResponse })

      const { result } = renderHook(() => useAggregatedAnalytics('42'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data?.trends.payments).toBeUndefined()
      expect(result.current.data?.trends.membership).toHaveLength(1)
    })

    /**
     * Test handling distinguishedProjection as object from fallback endpoint
     *
     * The /analytics endpoint returns distinguishedProjection as an object,
     * while /analytics-summary returns it as a number. The hook should
     * extract the projectedDistinguished value when falling back.
     */
    it('should convert distinguishedProjection object to number in fallback', async () => {
      const aggregatedError = new Error('Aggregated endpoint failed')
      const individualResponse = createMockIndividualAnalyticsResponse({
        // Override with object format (as returned by /analytics endpoint)
        distinguishedProjection: {
          projectedDistinguished: 30,
          currentDistinguished: 25,
          currentSelect: 18,
          currentPresident: 12,
          projectionDate: '2024-06-30',
        } as unknown as number, // Type assertion needed for test
      })

      mockedApiClient.get.mockImplementation((url: string) => {
        if (url.includes('analytics-summary')) {
          return Promise.reject(aggregatedError)
        }
        return Promise.resolve({ data: individualResponse })
      })

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
