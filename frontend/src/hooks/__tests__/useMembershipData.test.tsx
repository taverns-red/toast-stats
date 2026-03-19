/**
 * Unit tests for useMembershipData hooks (CDN-only)
 * Feature: date-aware-district-statistics
 *
 * Validates: Requirements 4.1
 *
 * Tests verify that useDistrictStatistics correctly:
 * - Includes selectedDate in the query key for proper cache invalidation
 * - Fetches from CDN with correct snapshot date
 * - Maintains backward compatibility when selectedDate is undefined
 * - Handles CDN errors appropriately
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { useDistrictStatistics } from '../useMembershipData'
import { fetchCdnManifest, fetchCdnDistrictSnapshot } from '../../services/cdn'
import type { DistrictStatistics } from '../../types/districts'

// Mock the CDN service
vi.mock('../../services/cdn', () => ({
  fetchCdnManifest: vi.fn(),
  fetchCdnDistrictSnapshot: vi.fn(),
  fetchCdnDistrictAnalytics: vi.fn(),
}))

const mockedFetchCdnManifest = vi.mocked(fetchCdnManifest)
const mockedFetchCdnDistrictSnapshot = vi.mocked(fetchCdnDistrictSnapshot)

// Create a mock DistrictStatistics response
const createMockDistrictStatistics = (
  districtId: string,
  asOfDate: string
): DistrictStatistics => ({
  districtId,
  asOfDate,
  membership: {
    totalMembers: 1000,
    activeMembers: 950,
    newMembers: 50,
    renewedMembers: 100,
    droppedMembers: 25,
    membershipGrowth: 2.5,
    retentionRate: 95.0,
  },
  clubs: {
    totalClubs: 50,
    activeClubs: 48,
    suspendedClubs: 2,
    newClubs: 3,
    clubGrowth: 1.5,
  },
  education: {
    totalAwards: 200,
    pathwaysCompletions: 150,
    traditionalCompletions: 50,
    educationGrowth: 5.0,
  },
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

describe('useDistrictStatistics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default manifest mock
    mockedFetchCdnManifest.mockResolvedValue({
      latestSnapshotDate: '2022-12-05',
      generatedAt: '2022-12-05T00:00:00Z',
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Query Key Behavior', () => {
    /**
     * Test that selectedDate is included in query key when provided
     * This ensures proper cache invalidation when the date changes
     *
     * **Validates: Requirements 4.1 (cache invalidation)**
     */
    it('should include selectedDate in query key when provided', async () => {
      const districtId = 'D101'
      const selectedDate = '2026-01-14'
      const mockData = createMockDistrictStatistics(districtId, selectedDate)

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, selectedDate),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Verify CDN was called with the specific date (not manifest)
      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenCalledWith(
        selectedDate,
        districtId
      )
    })

    /**
     * Test that query key works correctly when selectedDate is undefined
     * This ensures backward compatibility with existing code
     *
     * **Validates: Requirements 4.1, Property 3 (backward compatibility)**
     */
    it('should work correctly when selectedDate is undefined', async () => {
      const districtId = 'D101'
      const mockData = createMockDistrictStatistics(districtId, '2022-12-05')

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, undefined),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Should use manifest date when no selectedDate
      expect(mockedFetchCdnManifest).toHaveBeenCalled()
      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenCalledWith(
        '2022-12-05',
        districtId
      )
    })

    /**
     * Test that different dates result in different cache entries
     * by verifying separate CDN calls are made for different dates
     *
     * **Validates: Requirements 4.1, Property 2 (query key uniqueness)**
     */
    it('should make separate CDN calls for different dates', async () => {
      const districtId = 'D101'
      const date1 = '2026-01-14'
      const date2 = '2026-01-15'
      const mockData1 = createMockDistrictStatistics(districtId, date1)
      const mockData2 = createMockDistrictStatistics(districtId, date2)

      mockedFetchCdnDistrictSnapshot
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2)

      const wrapper = createWrapper()

      // First hook with date1
      const { result: result1 } = renderHook(
        () => useDistrictStatistics(districtId, date1),
        { wrapper }
      )

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true)
      })

      // Second hook with date2 (different date should trigger new CDN call)
      const { result: result2 } = renderHook(
        () => useDistrictStatistics(districtId, date2),
        { wrapper }
      )

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true)
      })

      // Verify both CDN calls were made with different dates
      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenCalledTimes(2)
      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenNthCalledWith(
        1,
        date1,
        districtId
      )
      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenNthCalledWith(
        2,
        date2,
        districtId
      )
    })
  })

  describe('CDN Parameter Passing', () => {
    /**
     * Test that specific date is passed to CDN when selectedDate is provided
     *
     * **Validates: Requirements 4.1, Property 1 (date parameter propagation)**
     */
    it('should pass selectedDate directly to CDN snapshot fetch', async () => {
      const districtId = 'D101'
      const selectedDate = '2026-01-14'
      const mockData = createMockDistrictStatistics(districtId, selectedDate)

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, selectedDate),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenCalledWith(
        selectedDate,
        districtId
      )
    })

    /**
     * Test that manifest date is used when selectedDate is undefined
     *
     * **Validates: Requirements 4.1, Property 3 (backward compatibility)**
     */
    it('should use manifest date when selectedDate is undefined', async () => {
      const districtId = 'D101'
      const mockData = createMockDistrictStatistics(districtId, '2022-12-05')

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => useDistrictStatistics(districtId), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Should use manifest's latestSnapshotDate
      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenCalledWith(
        '2022-12-05',
        districtId
      )
    })

    /**
     * Test that empty string selectedDate uses manifest date
     *
     * **Validates: Requirements 4.1**
     */
    it('should use manifest date when selectedDate is empty string', async () => {
      const districtId = 'D101'
      const mockData = createMockDistrictStatistics(districtId, '2022-12-05')

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, ''),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Empty string is falsy, so manifest date should be used
      expect(mockedFetchCdnManifest).toHaveBeenCalled()
    })
  })

  describe('Backward Compatibility', () => {
    /**
     * Test that hook works without selectedDate parameter (original signature)
     *
     * **Validates: Requirements 6.2, Property 3 (backward compatibility)**
     */
    it('should work when called with only districtId (backward compatible)', async () => {
      const districtId = 'D101'
      const mockData = createMockDistrictStatistics(districtId, '2022-12-05')

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => useDistrictStatistics(districtId), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
    })

    /**
     * Test that hook returns latest snapshot when no date is provided
     *
     * **Validates: Requirements 6.2**
     */
    it('should return data successfully when no date is provided', async () => {
      const districtId = 'D101'
      const latestDate = '2022-12-05'
      const mockData = createMockDistrictStatistics(districtId, latestDate)

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => useDistrictStatistics(districtId), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.asOfDate).toBe(latestDate)
    })
  })

  describe('Error Handling', () => {
    /**
     * Test that CDN errors are properly propagated
     *
     * **Validates: Requirements 4.1**
     */
    it('should handle CDN errors correctly', async () => {
      const districtId = 'D101'
      const selectedDate = '2026-01-14'
      const errorMessage =
        'CDN fetch failed: 404 for https://cdn.taverns.red/snapshots/2026-01-14/district_D101.json'

      mockedFetchCdnDistrictSnapshot.mockRejectedValue(new Error(errorMessage))

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, selectedDate),
        { wrapper: createWrapper() }
      )

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true)
        },
        { timeout: 5000 }
      )

      expect(result.current.error?.message).toBe(errorMessage)
    })

    /**
     * Test that 404 errors are handled (district not found)
     *
     * **Validates: Requirements 5.2**
     */
    it('should handle 404 errors for non-existent districts', async () => {
      const districtId = 'INVALID'
      const selectedDate = '2026-01-14'

      const error = new Error('CDN fetch failed: 404')
      mockedFetchCdnDistrictSnapshot.mockRejectedValue(error)

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, selectedDate),
        { wrapper: createWrapper() }
      )

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true)
        },
        { timeout: 5000 }
      )

      expect(result.current.error).toBeDefined()
    })

    /**
     * Test that manifest fetch errors are handled
     *
     * **Validates: Requirements 4.3**
     */
    it('should handle manifest fetch errors', async () => {
      const districtId = 'D101'

      mockedFetchCdnManifest.mockRejectedValue(
        new Error('CDN manifest fetch failed: 500')
      )

      const { result } = renderHook(() => useDistrictStatistics(districtId), {
        wrapper: createWrapper(),
      })

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true)
        },
        { timeout: 5000 }
      )

      expect(result.current.error?.message).toContain('manifest')
    })
  })

  describe('Query Enabled State', () => {
    /**
     * Test that query is disabled when districtId is null
     *
     * **Validates: Requirements 4.1**
     */
    it('should not fetch when districtId is null', async () => {
      const { result } = renderHook(
        () => useDistrictStatistics(null, '2026-01-14'),
        { wrapper: createWrapper() }
      )

      // Query should not be enabled
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockedFetchCdnDistrictSnapshot).not.toHaveBeenCalled()
    })

    /**
     * Test that query is enabled when districtId is provided
     *
     * **Validates: Requirements 4.1**
     */
    it('should fetch when districtId is provided', async () => {
      const districtId = 'D101'
      const mockData = createMockDistrictStatistics(districtId, '2026-01-14')

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, '2026-01-14'),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenCalled()
    })
  })

  describe('Data Returned', () => {
    /**
     * Test that the hook returns the correct data structure
     *
     * **Validates: Requirements 4.1**
     */
    it('should return DistrictStatistics data on success', async () => {
      const districtId = 'D101'
      const selectedDate = '2026-01-14'
      const mockData = createMockDistrictStatistics(districtId, selectedDate)

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, selectedDate),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(result.current.data?.districtId).toBe(districtId)
      expect(result.current.data?.asOfDate).toBe(selectedDate)
    })
  })

  describe('Fields Parameter', () => {
    /**
     * Test that fields parameter is included in query key
     * Note: CDN always returns the full snapshot but fields is in query key for caching
     */
    it('should include fields in query key for cache differentiation', async () => {
      const districtId = 'D101'
      const selectedDate = '2026-01-14'
      const mockData = createMockDistrictStatistics(districtId, selectedDate)

      mockedFetchCdnDistrictSnapshot
        .mockResolvedValueOnce(mockData)
        .mockResolvedValueOnce(mockData)

      const wrapper = createWrapper()

      // First hook without fields
      const { result: result1 } = renderHook(
        () => useDistrictStatistics(districtId, selectedDate),
        { wrapper }
      )

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true)
      })

      // Second hook with fields — should make a separate CDN call
      const { result: result2 } = renderHook(
        () => useDistrictStatistics(districtId, selectedDate, 'divisions'),
        { wrapper }
      )

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true)
      })

      // Both calls should have been made (different query keys)
      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenCalledTimes(2)
    })
  })
})
