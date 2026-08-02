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
import {
  fetchLatestSnapshotDate,
  fetchCdnDistrictSnapshot,
} from '../../services/cdn'
import { toSnapshotDate } from '../../types/snapshotDate'
import { snap } from '../../test-utils/snapshotDate'
import type { DistrictStatistics } from '../../types/districts'

// Mock the CDN service
vi.mock('../../services/cdn', () => ({
  fetchLatestSnapshotDate: vi.fn(),
  fetchCdnDistrictSnapshot: vi.fn(),
  fetchCdnDistrictAnalytics: vi.fn(),
}))

const mockedFetchLatestSnapshotDate = vi.mocked(fetchLatestSnapshotDate)
const mockedFetchCdnDistrictSnapshot = vi.mocked(fetchCdnDistrictSnapshot)

/**
 * Build a mock `DistrictStatistics` payload.
 *
 * Until #1368 this fixture invented its own shape — `asOfDate` at the top level
 * plus `membership.totalMembers` / `clubs.totalClubs` /
 * `education.pathwaysCompletions`, none of which exist on `DistrictStatistics`.
 * The declared return type said otherwise, but nothing typechecked this file,
 * so the whole suite ran against a payload the CDN never sends. `asOfDate` in
 * particular is the phantom #1321 deleted from the snapshot envelope.
 */
const createMockDistrictStatistics = (
  districtId: string
): DistrictStatistics => ({
  districtId,
  membership: {
    total: 1000,
    change: 50,
    changePercent: 2.5,
  },
  clubs: {
    total: 50,
    active: 48,
    suspended: 2,
    ineligible: 0,
    low: 5,
    distinguished: 12,
  },
  education: {
    totalAwards: 200,
    byType: [],
    topClubs: [],
    byMonth: [],
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
    // Default "latest snapshot" mock. The hook no longer reads the raw
    // manifest — fetchLatestSnapshotDate is the blessed mint that validates it
    // and hands back a branded SnapshotDate (#1323).
    mockedFetchLatestSnapshotDate.mockResolvedValue(
      toSnapshotDate('2022-12-05')!
    )
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
      const selectedDate = snap('2026-01-14')
      const mockData = createMockDistrictStatistics(districtId)

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
      const mockData = createMockDistrictStatistics(districtId)

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, undefined),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Should use the latest snapshot date when no selectedDate
      expect(mockedFetchLatestSnapshotDate).toHaveBeenCalled()
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
      const date1 = snap('2026-01-14')
      const date2 = snap('2026-01-15')
      const mockData1 = createMockDistrictStatistics(districtId)
      const mockData2 = createMockDistrictStatistics(districtId)

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
      const selectedDate = snap('2026-01-14')
      const mockData = createMockDistrictStatistics(districtId)

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
      const mockData = createMockDistrictStatistics(districtId)

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
      const mockData = createMockDistrictStatistics(districtId)

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      // The hook takes a branded `SnapshotDate`, so a bare `''` can no longer
      // be handed to it — the mint is the only route in, and it rejects the
      // empty string outright. That rejection is the first half of the
      // guarantee; the hook's `selectedDate || manifest` fallback is the
      // second. (Before #1368 nothing typechecked this file, so it passed `''`
      // directly — a call production cannot make.)
      const emptyDate = toSnapshotDate('')
      expect(emptyDate).toBeUndefined()

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, emptyDate),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // No usable date, so the manifest date should be used
      expect(mockedFetchLatestSnapshotDate).toHaveBeenCalled()
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
      const mockData = createMockDistrictStatistics(districtId)

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
      const mockData = createMockDistrictStatistics(districtId)

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(() => useDistrictStatistics(districtId), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // `asOfDate` is not on `DistrictStatistics` — the snapshot envelope
      // never carried it (#1321). What this test is really about is that the
      // no-date path resolves the latest snapshot and returns its payload.
      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenCalledWith(
        latestDate,
        districtId
      )
      expect(result.current.data).toEqual(mockData)
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
      const selectedDate = snap('2026-01-14')
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
      const selectedDate = snap('2026-01-14')

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

      mockedFetchLatestSnapshotDate.mockRejectedValue(
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
        () => useDistrictStatistics(null, snap('2026-01-14')),
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
      const mockData = createMockDistrictStatistics(districtId)

      mockedFetchCdnDistrictSnapshot.mockResolvedValueOnce(mockData)

      const { result } = renderHook(
        () => useDistrictStatistics(districtId, snap('2026-01-14')),
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
      const selectedDate = snap('2026-01-14')
      const mockData = createMockDistrictStatistics(districtId)

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
      // See above: no `asOfDate` on the envelope. The date contract this test
      // cares about is which snapshot was fetched.
      expect(mockedFetchCdnDistrictSnapshot).toHaveBeenCalledWith(
        selectedDate,
        districtId
      )
    })
  })

  describe('Fields Parameter', () => {
    /**
     * Test that fields parameter is included in query key
     * Note: CDN always returns the full snapshot but fields is in query key for caching
     */
    it('should include fields in query key for cache differentiation', async () => {
      const districtId = 'D101'
      const selectedDate = snap('2026-01-14')
      const mockData = createMockDistrictStatistics(districtId)

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
