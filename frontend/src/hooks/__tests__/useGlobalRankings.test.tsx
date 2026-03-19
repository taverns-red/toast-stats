/**
 * Unit tests for useGlobalRankings hook
 * Feature: district-global-rankings
 *
 * Validates: Requirements 2.1, 2.2, 3.1-3.6, 5.2, 5.3
 *
 * Tests verify that the useGlobalRankings hook correctly:
 * - Aggregates data from useAvailableProgramYears (CDN) and useRankHistory (Express)
 * - Extracts end-of-year rankings from history data
 * - Calculates year-over-year rank changes
 * - Returns proper loading, error, and success states
 * - Provides a refetch function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useGlobalRankings,
  extractEndOfYearRankings,
  calculateYearOverYearChange,
  convertToProgramYear,
  globalRankingsQueryKeys,
  buildYearlyRankingSummaries,
  type EndOfYearRankings,
} from '../useGlobalRankings'
import { apiClient } from '../../services/api'
import { fetchCdnDates } from '../../services/cdn'
import type {
  RankHistoryResponse,
  ProgramYearWithData,
} from '../../types/districts'

// Mock the CDN service (used by useAvailableProgramYears)
vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn(),
}))

// Mock the API client (still used by useRankHistory)
vi.mock('../../services/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const mockedFetchCdnDates = vi.mocked(fetchCdnDates)
const mockedApiClient = vi.mocked(apiClient)

/**
 * Create simplified CDN dates with unique dates across 3 program years.
 */
const createSimpleDatesForRankings = () => ({
  dates: [
    // 2022-2023 (13 dates)
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
    // 2023-2024 (13 dates)
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
    // 2025-2026 (5 dates, current year)
    '2025-07-15',
    '2025-08-15',
    '2025-09-15',
    '2025-10-15',
    '2025-11-15',
  ],
  count: 31,
  generatedAt: '2025-11-15T00:00:00Z',
})

// ========== Test Data Factories ==========

const createMockRankHistoryResponse = (
  districtId: string,
  programYear: string = '2025-2026'
): RankHistoryResponse => ({
  districtId,
  districtName: `District ${districtId}`,
  history: [
    {
      date: '2025-07-15',
      aggregateScore: 350,
      clubsRank: 15,
      paymentsRank: 20,
      distinguishedRank: 10,
      totalDistricts: 126,
    },
    {
      date: '2025-08-15',
      aggregateScore: 355,
      clubsRank: 12,
      paymentsRank: 18,
      distinguishedRank: 8,
      totalDistricts: 126,
    },
    {
      date: '2025-09-15',
      aggregateScore: 360,
      clubsRank: 10,
      paymentsRank: 15,
      distinguishedRank: 5,
      totalDistricts: 126,
    },
  ],
  programYear: {
    startDate: programYear === '2025-2026' ? '2025-07-01' : '2023-07-01',
    endDate: programYear === '2025-2026' ? '2026-06-30' : '2024-06-30',
    year: programYear,
  },
})

const createMockProgramYearWithData = (
  year: string,
  hasCompleteData: boolean = true
): ProgramYearWithData => ({
  year,
  startDate: `${year.split('-')[0]}-07-01`,
  endDate: `${year.split('-')[1]}-06-30`,
  hasCompleteData,
  snapshotCount: hasCompleteData ? 52 : 15,
  latestSnapshotDate: hasCompleteData
    ? `${year.split('-')[1]}-06-30`
    : '2024-11-15',
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

describe('useGlobalRankings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Query Key Factory', () => {
    it('should produce correct query keys', () => {
      expect(globalRankingsQueryKeys.all).toEqual(['global-rankings'])
      expect(globalRankingsQueryKeys.byDistrict('57')).toEqual([
        'global-rankings',
        '57',
      ])
      expect(
        globalRankingsQueryKeys.byDistrictAndYear('57', '2024-2025')
      ).toEqual(['global-rankings', '57', '2024-2025'])
    })
  })

  describe('Successful Data Fetching', () => {
    it('should fetch and aggregate ranking data for a district', async () => {
      const districtId = '57'
      const mockRankHistory = createMockRankHistoryResponse(districtId)

      // Mock CDN dates (used by useAvailableProgramYears)
      mockedFetchCdnDates.mockResolvedValue(createSimpleDatesForRankings())

      // Mock Express POST for rank history batch
      mockedApiClient.post.mockImplementation((url: string) => {
        if (url.includes('rank-history-batch')) {
          return Promise.resolve({ data: [mockRankHistory] })
        }
        return Promise.reject(new Error(`Unexpected POST URL: ${url}`))
      })

      const { result } = renderHook(() => useGlobalRankings({ districtId }), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isError).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.availableProgramYears.length).toBeGreaterThan(0)
      expect(result.current.currentYearHistory).not.toBeNull()
    })

    it('should convert available program years to ProgramYear format', async () => {
      const districtId = '57'
      const mockRankHistory = createMockRankHistoryResponse(districtId)

      mockedFetchCdnDates.mockResolvedValue(createSimpleDatesForRankings())
      mockedApiClient.post.mockImplementation((url: string) => {
        if (url.includes('rank-history-batch')) {
          return Promise.resolve({ data: [mockRankHistory] })
        }
        return Promise.reject(new Error(`Unexpected POST URL: ${url}`))
      })

      const { result } = renderHook(() => useGlobalRankings({ districtId }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const firstYear = result.current.availableProgramYears[0]
      expect(firstYear).toMatchObject({
        year: 2025,
        startDate: '2025-07-01',
        endDate: '2026-06-30',
        label: '2025-2026',
      })
    })

    it('should extract end-of-year rankings from history data', async () => {
      const districtId = '57'
      const mockRankHistory = createMockRankHistoryResponse(districtId)

      mockedFetchCdnDates.mockResolvedValue(createSimpleDatesForRankings())
      mockedApiClient.post.mockImplementation((url: string) => {
        if (url.includes('rank-history-batch')) {
          return Promise.resolve({ data: [mockRankHistory] })
        }
        return Promise.reject(new Error(`Unexpected POST URL: ${url}`))
      })

      const { result } = renderHook(() => useGlobalRankings({ districtId }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const rankings = result.current.endOfYearRankings
      expect(rankings).not.toBeNull()
      expect(rankings?.paidClubs.rank).toBe(10) // Latest point
      expect(rankings?.membershipPayments.rank).toBe(15)
      expect(rankings?.distinguishedClubs.rank).toBe(5)
      expect(rankings?.asOfDate).toBe('2025-09-15')
      expect(rankings?.isPartialYear).toBe(true) // 2025-2026 is not complete
    })
  })

  describe('Loading State', () => {
    it('should return isLoading=true while fetching', async () => {
      const districtId = '57'
      const mockRankHistory = createMockRankHistoryResponse(districtId)

      mockedFetchCdnDates.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve(createSimpleDatesForRankings()), 50)
          )
      )
      mockedApiClient.post.mockImplementation((url: string) => {
        if (url.includes('rank-history-batch')) {
          return new Promise(resolve =>
            setTimeout(() => resolve({ data: [mockRankHistory] }), 50)
          )
        }
        return Promise.reject(new Error(`Unexpected POST URL: ${url}`))
      })

      const { result } = renderHook(() => useGlobalRankings({ districtId }), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle CDN errors correctly', async () => {
      const districtId = '57'
      const errorMessage = 'CDN dates fetch failed: 500'

      mockedFetchCdnDates.mockRejectedValue(new Error(errorMessage))

      const { result } = renderHook(() => useGlobalRankings({ districtId }), {
        wrapper: createWrapper(),
      })

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true)
        },
        { timeout: 5000 }
      )

      expect(result.current.error?.message).toBe(errorMessage)
    })
  })

  describe('Refetch Function', () => {
    it('should provide a working refetch function', async () => {
      const districtId = '57'
      const mockRankHistory = createMockRankHistoryResponse(districtId)

      mockedFetchCdnDates.mockResolvedValue(createSimpleDatesForRankings())
      mockedApiClient.post.mockImplementation((url: string) => {
        if (url.includes('rank-history-batch')) {
          return Promise.resolve({ data: [mockRankHistory] })
        }
        return Promise.reject(new Error(`Unexpected POST URL: ${url}`))
      })

      const { result } = renderHook(() => useGlobalRankings({ districtId }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(typeof result.current.refetch).toBe('function')
    })
  })

  describe('Empty Data Handling', () => {
    it('should handle empty dates from CDN', async () => {
      const districtId = '57'

      mockedFetchCdnDates.mockResolvedValue({
        dates: [],
        count: 0,
        generatedAt: '2025-11-15T00:00:00Z',
      })

      mockedApiClient.post.mockImplementation((url: string) => {
        if (url.includes('rank-history-batch')) {
          return Promise.resolve({
            data: [
              {
                districtId,
                districtName: `District ${districtId}`,
                history: [],
                programYear: {
                  startDate: '',
                  endDate: '',
                  year: '',
                },
              },
            ],
          })
        }
        return Promise.reject(new Error(`Unexpected POST URL: ${url}`))
      })

      const { result } = renderHook(() => useGlobalRankings({ districtId }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.availableProgramYears).toHaveLength(0)
      expect(result.current.currentYearHistory).toBeNull()
      expect(result.current.endOfYearRankings).toBeNull()
    })
  })
})

describe('Helper Functions', () => {
  describe('convertToProgramYear', () => {
    it('should convert ProgramYearWithData to ProgramYear format', () => {
      const input: ProgramYearWithData = {
        year: '2023-2024',
        startDate: '2023-07-01',
        endDate: '2024-06-30',
        hasCompleteData: true,
        snapshotCount: 52,
        latestSnapshotDate: '2024-06-30',
      }

      const result = convertToProgramYear(input)

      expect(result).toEqual({
        year: 2023,
        startDate: '2023-07-01',
        endDate: '2024-06-30',
        label: '2023-2024',
      })
    })
  })

  describe('extractEndOfYearRankings', () => {
    it('should extract rankings from the most recent history point', () => {
      const history: RankHistoryResponse = {
        districtId: '57',
        districtName: 'District 57',
        history: [
          {
            date: '2024-07-15',
            aggregateScore: 350,
            clubsRank: 15,
            paymentsRank: 20,
            distinguishedRank: 10,
            totalDistricts: 126,
          },
          {
            date: '2024-09-15',
            aggregateScore: 360,
            clubsRank: 10,
            paymentsRank: 15,
            distinguishedRank: 5,
            totalDistricts: 126,
          },
          {
            date: '2024-08-15',
            aggregateScore: 355,
            clubsRank: 12,
            paymentsRank: 18,
            distinguishedRank: 8,
            totalDistricts: 126,
          },
        ],
        programYear: {
          startDate: '2024-07-01',
          endDate: '2025-06-30',
          year: '2024-2025',
        },
      }

      const programYearData = createMockProgramYearWithData('2024-2025', false)
      const result = extractEndOfYearRankings(history, programYearData)

      expect(result).not.toBeNull()
      expect(result?.paidClubs.rank).toBe(10)
      expect(result?.membershipPayments.rank).toBe(15)
      expect(result?.distinguishedClubs.rank).toBe(5)
      expect(result?.asOfDate).toBe('2024-09-15')
      expect(result?.isPartialYear).toBe(true)
    })

    it('should use overallRank from API when present', () => {
      const history: RankHistoryResponse = {
        districtId: '57',
        districtName: 'District 57',
        history: [
          {
            date: '2024-09-15',
            aggregateScore: 360,
            clubsRank: 10,
            paymentsRank: 15,
            distinguishedRank: 5,
            totalDistricts: 126,
            overallRank: 7,
          },
        ],
        programYear: {
          startDate: '2024-07-01',
          endDate: '2025-06-30',
          year: '2024-2025',
        },
      }

      const programYearData = createMockProgramYearWithData('2024-2025', false)
      const result = extractEndOfYearRankings(history, programYearData)

      expect(result).not.toBeNull()
      expect(result?.overall.rank).toBe(7)
    })

    it('should fall back to averaging category ranks when overallRank is missing (legacy data)', () => {
      const history: RankHistoryResponse = {
        districtId: '57',
        districtName: 'District 57',
        history: [
          {
            date: '2024-09-15',
            aggregateScore: 360,
            clubsRank: 10,
            paymentsRank: 15,
            distinguishedRank: 5,
            totalDistricts: 126,
          },
        ],
        programYear: {
          startDate: '2024-07-01',
          endDate: '2025-06-30',
          year: '2024-2025',
        },
      }

      const programYearData = createMockProgramYearWithData('2024-2025', false)
      const result = extractEndOfYearRankings(history, programYearData)

      expect(result).not.toBeNull()
      expect(result?.overall.rank).toBe(10)
    })

    it('should use overallRank even when it differs significantly from category average', () => {
      const history: RankHistoryResponse = {
        districtId: '57',
        districtName: 'District 57',
        history: [
          {
            date: '2024-09-15',
            aggregateScore: 400,
            clubsRank: 50,
            paymentsRank: 60,
            distinguishedRank: 70,
            totalDistricts: 126,
            overallRank: 3,
          },
        ],
        programYear: {
          startDate: '2024-07-01',
          endDate: '2025-06-30',
          year: '2024-2025',
        },
      }

      const programYearData = createMockProgramYearWithData('2024-2025', false)
      const result = extractEndOfYearRankings(history, programYearData)

      expect(result).not.toBeNull()
      expect(result?.overall.rank).toBe(3)
      expect(result?.paidClubs.rank).toBe(50)
      expect(result?.membershipPayments.rank).toBe(60)
      expect(result?.distinguishedClubs.rank).toBe(70)
    })

    it('should calculate percentiles correctly', () => {
      const history: RankHistoryResponse = {
        districtId: '57',
        districtName: 'District 57',
        history: [
          {
            date: '2024-09-15',
            aggregateScore: 360,
            clubsRank: 1,
            paymentsRank: 126,
            distinguishedRank: 63,
            totalDistricts: 126,
          },
        ],
        programYear: {
          startDate: '2024-07-01',
          endDate: '2025-06-30',
          year: '2024-2025',
        },
      }

      const programYearData = createMockProgramYearWithData('2024-2025', true)
      const result = extractEndOfYearRankings(history, programYearData)

      expect(result).not.toBeNull()
      expect(result?.paidClubs.percentile).toBe(100)
      expect(result?.membershipPayments.percentile).toBeCloseTo(0.8, 1)
      expect(result?.distinguishedClubs.percentile).toBeCloseTo(50.8, 1)
    })

    it('should return null for empty history', () => {
      const history: RankHistoryResponse = {
        districtId: '57',
        districtName: 'District 57',
        history: [],
        programYear: {
          startDate: '2024-07-01',
          endDate: '2025-06-30',
          year: '2024-2025',
        },
      }

      const result = extractEndOfYearRankings(history, undefined)
      expect(result).toBeNull()
    })

    it('should return null for null history', () => {
      const result = extractEndOfYearRankings(null, undefined)
      expect(result).toBeNull()
    })
  })

  describe('calculateYearOverYearChange', () => {
    it('should calculate positive change for rank improvement', () => {
      const currentYear: EndOfYearRankings = {
        overall: { rank: 5, totalDistricts: 126, percentile: 96.8 },
        paidClubs: { rank: 5, totalDistricts: 126, percentile: 96.8 },
        membershipPayments: { rank: 8, totalDistricts: 126, percentile: 94.4 },
        distinguishedClubs: { rank: 3, totalDistricts: 126, percentile: 98.4 },
        asOfDate: '2024-06-30',
        isPartialYear: false,
      }

      const previousYear: EndOfYearRankings = {
        overall: { rank: 10, totalDistricts: 126, percentile: 92.9 },
        paidClubs: { rank: 10, totalDistricts: 126, percentile: 92.9 },
        membershipPayments: { rank: 15, totalDistricts: 126, percentile: 88.9 },
        distinguishedClubs: { rank: 8, totalDistricts: 126, percentile: 94.4 },
        asOfDate: '2023-06-30',
        isPartialYear: false,
      }

      const result = calculateYearOverYearChange(currentYear, previousYear)

      expect(result).not.toBeNull()
      expect(result?.overall).toBe(5)
      expect(result?.clubs).toBe(5)
      expect(result?.payments).toBe(7)
      expect(result?.distinguished).toBe(5)
    })

    it('should calculate negative change for rank decline', () => {
      const currentYear: EndOfYearRankings = {
        overall: { rank: 15, totalDistricts: 126, percentile: 88.9 },
        paidClubs: { rank: 15, totalDistricts: 126, percentile: 88.9 },
        membershipPayments: { rank: 20, totalDistricts: 126, percentile: 84.9 },
        distinguishedClubs: { rank: 12, totalDistricts: 126, percentile: 91.3 },
        asOfDate: '2024-06-30',
        isPartialYear: false,
      }

      const previousYear: EndOfYearRankings = {
        overall: { rank: 10, totalDistricts: 126, percentile: 92.9 },
        paidClubs: { rank: 10, totalDistricts: 126, percentile: 92.9 },
        membershipPayments: { rank: 12, totalDistricts: 126, percentile: 91.3 },
        distinguishedClubs: { rank: 8, totalDistricts: 126, percentile: 94.4 },
        asOfDate: '2023-06-30',
        isPartialYear: false,
      }

      const result = calculateYearOverYearChange(currentYear, previousYear)

      expect(result).not.toBeNull()
      expect(result?.overall).toBe(-5)
      expect(result?.clubs).toBe(-5)
      expect(result?.payments).toBe(-8)
      expect(result?.distinguished).toBe(-4)
    })

    it('should return null when current year is null', () => {
      const previousYear: EndOfYearRankings = {
        overall: { rank: 10, totalDistricts: 126, percentile: 92.9 },
        paidClubs: { rank: 10, totalDistricts: 126, percentile: 92.9 },
        membershipPayments: { rank: 15, totalDistricts: 126, percentile: 88.9 },
        distinguishedClubs: { rank: 8, totalDistricts: 126, percentile: 94.4 },
        asOfDate: '2023-06-30',
        isPartialYear: false,
      }

      const result = calculateYearOverYearChange(null, previousYear)
      expect(result).toBeNull()
    })

    it('should return null when previous year is null', () => {
      const currentYear: EndOfYearRankings = {
        overall: { rank: 5, totalDistricts: 126, percentile: 96.8 },
        paidClubs: { rank: 5, totalDistricts: 126, percentile: 96.8 },
        membershipPayments: { rank: 8, totalDistricts: 126, percentile: 94.4 },
        distinguishedClubs: { rank: 3, totalDistricts: 126, percentile: 98.4 },
        asOfDate: '2024-06-30',
        isPartialYear: false,
      }

      const result = calculateYearOverYearChange(currentYear, null)
      expect(result).toBeNull()
    })
  })

  describe('buildYearlyRankingSummaries', () => {
    it('should use overallRank from API when present in history data', () => {
      const programYears: ProgramYearWithData[] = [
        {
          year: '2023-2024',
          startDate: '2023-07-01',
          endDate: '2024-06-30',
          hasCompleteData: true,
          snapshotCount: 52,
          latestSnapshotDate: '2024-06-30',
        },
      ]

      const historyByYear = new Map<string, RankHistoryResponse>()
      historyByYear.set('2023-2024', {
        districtId: '57',
        districtName: 'District 57',
        history: [
          {
            date: '2024-06-30',
            aggregateScore: 380,
            clubsRank: 12,
            paymentsRank: 18,
            distinguishedRank: 9,
            totalDistricts: 126,
            overallRank: 5,
          },
        ],
        programYear: {
          startDate: '2023-07-01',
          endDate: '2024-06-30',
          year: '2023-2024',
        },
      })

      const result = buildYearlyRankingSummaries(programYears, historyByYear)

      expect(result).toHaveLength(1)
      expect(result[0]?.overallRank).toBe(5)
      expect(result[0]?.clubsRank).toBe(12)
      expect(result[0]?.paymentsRank).toBe(18)
      expect(result[0]?.distinguishedRank).toBe(9)
    })

    it('should fall back to averaging category ranks when overallRank is missing', () => {
      const programYears: ProgramYearWithData[] = [
        {
          year: '2022-2023',
          startDate: '2022-07-01',
          endDate: '2023-06-30',
          hasCompleteData: true,
          snapshotCount: 48,
          latestSnapshotDate: '2023-06-30',
        },
      ]

      const historyByYear = new Map<string, RankHistoryResponse>()
      historyByYear.set('2022-2023', {
        districtId: '57',
        districtName: 'District 57',
        history: [
          {
            date: '2023-06-30',
            aggregateScore: 350,
            clubsRank: 15,
            paymentsRank: 21,
            distinguishedRank: 12,
            totalDistricts: 126,
          },
        ],
        programYear: {
          startDate: '2022-07-01',
          endDate: '2023-06-30',
          year: '2022-2023',
        },
      })

      const result = buildYearlyRankingSummaries(programYears, historyByYear)

      expect(result).toHaveLength(1)
      expect(result[0]?.overallRank).toBe(16)
    })

    it('should calculate year-over-year changes using overallRank from API', () => {
      const programYears: ProgramYearWithData[] = [
        {
          year: '2023-2024',
          startDate: '2023-07-01',
          endDate: '2024-06-30',
          hasCompleteData: true,
          snapshotCount: 52,
          latestSnapshotDate: '2024-06-30',
        },
        {
          year: '2022-2023',
          startDate: '2022-07-01',
          endDate: '2023-06-30',
          hasCompleteData: true,
          snapshotCount: 48,
          latestSnapshotDate: '2023-06-30',
        },
      ]

      const historyByYear = new Map<string, RankHistoryResponse>()

      historyByYear.set('2022-2023', {
        districtId: '57',
        districtName: 'District 57',
        history: [
          {
            date: '2023-06-30',
            aggregateScore: 350,
            clubsRank: 15,
            paymentsRank: 20,
            distinguishedRank: 10,
            totalDistricts: 126,
            overallRank: 10,
          },
        ],
        programYear: {
          startDate: '2022-07-01',
          endDate: '2023-06-30',
          year: '2022-2023',
        },
      })

      historyByYear.set('2023-2024', {
        districtId: '57',
        districtName: 'District 57',
        history: [
          {
            date: '2024-06-30',
            aggregateScore: 380,
            clubsRank: 10,
            paymentsRank: 15,
            distinguishedRank: 5,
            totalDistricts: 126,
            overallRank: 5,
          },
        ],
        programYear: {
          startDate: '2023-07-01',
          endDate: '2024-06-30',
          year: '2023-2024',
        },
      })

      const result = buildYearlyRankingSummaries(programYears, historyByYear)

      expect(result).toHaveLength(2)

      const currentYear = result[0]
      expect(currentYear?.programYear).toBe('2023-2024')
      expect(currentYear?.overallRank).toBe(5)
      expect(currentYear?.yearOverYearChange?.overall).toBe(5)

      const previousYear = result[1]
      expect(previousYear?.programYear).toBe('2022-2023')
      expect(previousYear?.overallRank).toBe(10)
      expect(previousYear?.yearOverYearChange).toBeNull()
    })

    it('should return empty array when no history data available', () => {
      const programYears: ProgramYearWithData[] = [
        {
          year: '2023-2024',
          startDate: '2023-07-01',
          endDate: '2024-06-30',
          hasCompleteData: false,
          snapshotCount: 0,
          latestSnapshotDate: '',
        },
      ]

      const historyByYear = new Map<string, RankHistoryResponse>()

      const result = buildYearlyRankingSummaries(programYears, historyByYear)

      expect(result).toHaveLength(0)
    })
  })
})
