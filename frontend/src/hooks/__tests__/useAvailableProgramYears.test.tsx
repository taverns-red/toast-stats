/**
 * Unit tests for useAvailableProgramYears hook (CDN-only)
 * Feature: district-global-rankings
 *
 * Validates: Requirements 2.1, 2.3
 *
 * Now derives program years from CDN dates index (#173).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useAvailableProgramYears,
  availableProgramYearsQueryKeys,
} from '../useAvailableProgramYears'
import { fetchCdnDates } from '../../services/cdn'
import type { CdnDatesIndex } from '../../services/cdn'

// Mock the CDN service
vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn(),
}))

const mockedFetchCdnDates = vi.mocked(fetchCdnDates)

/**
 * Build a mock CDN dates index with dates spanning multiple program years.
 * This replaces the old Express mock which returned pre-computed program years.
 * Now the hook derives program years from raw dates.
 */
const createMockDatesForProgramYears = (): CdnDatesIndex => ({
  dates: [
    // 2022-2023 program year (Jul 2022 – Jun 2023)
    '2022-07-15',
    '2022-08-15',
    '2022-09-15',
    '2022-10-15',
    '2022-11-15',
    '2022-12-15',
    '2023-01-15',
    '2023-02-15',
    '2023-03-15',
    '2023-04-15',
    '2023-05-15',
    '2023-06-15',
    '2023-06-30',
    // 48 dates total in this range (simplified to 13 here)

    // 2023-2024 program year (Jul 2023 – Jun 2024)
    '2023-07-15',
    '2023-08-15',
    '2023-09-15',
    '2023-10-15',
    '2023-11-15',
    '2023-12-15',
    '2024-01-15',
    '2024-02-15',
    '2024-03-15',
    '2024-04-15',
    '2024-05-15',
    '2024-06-15',
    '2024-06-30',

    // 2025-2026 program year (Jul 2025 – Jun 2026) — current/incomplete
    '2025-07-15',
    '2025-08-15',
    '2025-09-15',
    '2025-10-15',
    '2025-11-15',
  ],
  count: 31,
  generatedAt: '2025-11-15T00:00:00Z',
})

const createEmptyDates = (): CdnDatesIndex => ({
  dates: [],
  count: 0,
  generatedAt: '2024-11-15T00:00:00Z',
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

describe('useAvailableProgramYears', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Query Key Factory', () => {
    it('should produce correct query keys', () => {
      expect(availableProgramYearsQueryKeys.all).toEqual([
        'available-ranking-years',
      ])
      expect(availableProgramYearsQueryKeys.byDistrict('57')).toEqual([
        'available-ranking-years',
        '57',
      ])
    })
  })

  describe('Successful Data Fetching', () => {
    it('should derive program years from CDN dates', async () => {
      const districtId = '57'
      mockedFetchCdnDates.mockResolvedValueOnce(
        createMockDatesForProgramYears()
      )

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isError).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.data?.districtId).toBe(districtId)
      expect(result.current.data?.programYears).toHaveLength(3)
    })

    it('should return program years sorted newest first with correct fields', async () => {
      const districtId = '57'
      mockedFetchCdnDates.mockResolvedValueOnce(
        createMockDatesForProgramYears()
      )

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const years = result.current.data?.programYears
      // Should be sorted newest first
      expect(years?.[0]?.year).toBe('2025-2026')
      expect(years?.[1]?.year).toBe('2023-2024')
      expect(years?.[2]?.year).toBe('2022-2023')

      // First year should have correct structure
      const firstYear = years?.[0]
      expect(firstYear?.startDate).toBe('2025-07-01')
      expect(firstYear?.endDate).toBe('2026-06-30')
      expect(firstYear?.hasCompleteData).toBe(false) // Current year
      expect(firstYear?.snapshotCount).toBe(5)
      expect(firstYear?.latestSnapshotDate).toBe('2025-11-15')
    })
  })

  describe('Loading State', () => {
    it('should return isLoading=true while fetching', async () => {
      const districtId = '57'

      mockedFetchCdnDates.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve(createMockDatesForProgramYears()), 100)
          )
      )

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toBeUndefined()

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data?.programYears).toHaveLength(3)
    })
  })

  describe('Error Handling', () => {
    it('should handle CDN errors correctly', async () => {
      const districtId = '57'
      const errorMessage = 'CDN dates fetch failed: 500'

      mockedFetchCdnDates.mockRejectedValue(new Error(errorMessage))

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true)
        },
        { timeout: 5000 }
      )

      expect(result.current.error?.message).toBe(errorMessage)
      expect(result.current.data).toBeUndefined()
    })

    it('should handle CDN 404 errors', async () => {
      const districtId = 'INVALID'

      const error = new Error('CDN dates fetch failed: 404')
      mockedFetchCdnDates.mockRejectedValue(error)

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
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
  })

  describe('Enabled Flag', () => {
    it('should not fetch when enabled is false', async () => {
      const districtId = '57'

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId, enabled: false }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(false)
      expect(mockedFetchCdnDates).not.toHaveBeenCalled()
    })

    it('should not fetch when districtId is empty string', async () => {
      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId: '' }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(false)
      expect(mockedFetchCdnDates).not.toHaveBeenCalled()
    })

    it('should fetch when districtId is provided and enabled is true', async () => {
      const districtId = '57'
      mockedFetchCdnDates.mockResolvedValueOnce(
        createMockDatesForProgramYears()
      )

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId, enabled: true }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockedFetchCdnDates).toHaveBeenCalled()
    })
  })

  describe('Refetch Function', () => {
    it('should provide a working refetch function', async () => {
      const districtId = '57'
      mockedFetchCdnDates.mockResolvedValue(createMockDatesForProgramYears())

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      mockedFetchCdnDates.mockClear()
      mockedFetchCdnDates.mockResolvedValue(createMockDatesForProgramYears())

      result.current.refetch()

      await waitFor(() => {
        expect(mockedFetchCdnDates).toHaveBeenCalled()
      })
    })
  })

  describe('Empty Data Handling', () => {
    it('should handle empty dates array', async () => {
      const districtId = '57'
      mockedFetchCdnDates.mockResolvedValueOnce(createEmptyDates())

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data?.programYears).toHaveLength(0)
      expect(result.current.isError).toBe(false)
    })

    it('should set isEmpty=true when data is loaded but contains no program years', async () => {
      const districtId = '57'
      mockedFetchCdnDates.mockResolvedValueOnce(createEmptyDates())

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isEmpty).toBe(true)
      expect(result.current.isError).toBe(false)
      expect(result.current.data?.programYears).toHaveLength(0)
    })

    it('should set isEmpty=false when data contains program years', async () => {
      const districtId = '57'
      mockedFetchCdnDates.mockResolvedValueOnce(
        createMockDatesForProgramYears()
      )

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isEmpty).toBe(false)
      expect(result.current.data?.programYears.length).toBeGreaterThan(0)
    })

    it('should set isEmpty=false while loading', async () => {
      const districtId = '57'

      mockedFetchCdnDates.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve(createMockDatesForProgramYears()), 100)
          )
      )

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      expect(result.current.isLoading).toBe(true)
      expect(result.current.isEmpty).toBe(false)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })

    it('should set isEmpty=false when in error state', async () => {
      const districtId = '57'

      mockedFetchCdnDates.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(
        () => useAvailableProgramYears({ districtId }),
        { wrapper: createWrapper() }
      )

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true)
        },
        { timeout: 5000 }
      )

      expect(result.current.isEmpty).toBe(false)
    })
  })

  describe('Different Districts', () => {
    it('should make separate CDN calls for different districts', async () => {
      const district1 = '57'
      const district2 = '101'

      mockedFetchCdnDates
        .mockResolvedValueOnce(createMockDatesForProgramYears())
        .mockResolvedValueOnce(createMockDatesForProgramYears())

      const wrapper = createWrapper()

      const { result: result1 } = renderHook(
        () => useAvailableProgramYears({ districtId: district1 }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false)
      })

      const { result: result2 } = renderHook(
        () => useAvailableProgramYears({ districtId: district2 }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false)
      })

      // Both calls should have been made (different query keys)
      expect(mockedFetchCdnDates).toHaveBeenCalledTimes(2)
    })
  })
})
