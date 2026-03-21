/**
 * Unit tests for useTimeSeries hook
 *
 * Verifies:
 * 1. Fetches metadata then program year files from CDN
 * 2. Computes base membership from last point of prior year
 * 3. Falls back to first point of current year when prior year unavailable
 * 4. Computes memberChange correctly
 * 5. Handles null districtId gracefully
 *
 * #170 — Time-series integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useTimeSeries } from '../useTimeSeries'
import type { ProgramYearIndexFile } from '@toastmasters/shared-contracts'

// Mock the CDN fetch functions
vi.mock('../../services/cdnTimeSeries', () => ({
  fetchTimeSeriesMetadata: vi.fn(),
  fetchTimeSeriesProgramYear: vi.fn(),
  getCurrentProgramYear: vi.fn(() => '2025-2026'),
  getPreviousProgramYears: vi.fn((_current: string, count: number) => {
    const years = []
    for (let i = 1; i <= count; i++) {
      years.push(`${2025 - i}-${2026 - i}`)
    }
    return years
  }),
}))

import {
  fetchTimeSeriesMetadata,
  fetchTimeSeriesProgramYear,
} from '../../services/cdnTimeSeries'

const mockFetchMetadata = vi.mocked(fetchTimeSeriesMetadata)
const mockFetchProgramYear = vi.mocked(fetchTimeSeriesProgramYear)

/** Helper to build a ProgramYearIndexFile for testing */
function makeProgramYearIndex(
  districtId: string,
  programYear: string,
  dataPoints: Array<{ date: string; membership: number; payments: number }>
): ProgramYearIndexFile {
  return {
    districtId,
    programYear,
    startDate: `${programYear.split('-')[0]}-07-01`,
    endDate: `${programYear.split('-')[1]}-06-30`,
    lastUpdated: '2026-03-20T00:00:00.000Z',
    dataPoints: dataPoints.map(dp => ({
      date: dp.date,
      snapshotId: dp.date,
      membership: dp.membership,
      payments: dp.payments,
      dcpGoals: 0,
      distinguishedTotal: 0,
      clubCounts: {
        total: 0,
        thriving: 0,
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

describe('useTimeSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not fetch when districtId is null', () => {
    const { result } = renderHook(() => useTimeSeries(null), {
      wrapper: createWrapper(),
    })

    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(mockFetchMetadata).not.toHaveBeenCalled()
  })

  it('should compute base membership from last point of prior year', async () => {
    mockFetchMetadata.mockResolvedValue({
      districtId: '61',
      lastUpdated: '2026-03-20T00:00:00.000Z',
      availableProgramYears: ['2024-2025', '2025-2026'],
      totalDataPoints: 20,
    })

    const priorYear = makeProgramYearIndex('61', '2024-2025', [
      { date: '2024-07-15', membership: 2900, payments: 5800 },
      { date: '2025-06-15', membership: 2850, payments: 5700 },
    ])

    const currentYear = makeProgramYearIndex('61', '2025-2026', [
      { date: '2025-07-15', membership: 2840, payments: 5680 },
      { date: '2026-03-19', membership: 2810, payments: 4637 },
    ])

    mockFetchProgramYear.mockImplementation(async (_id, year) => {
      if (year === '2024-2025') return priorYear
      if (year === '2025-2026') return currentYear
      throw new Error('Not found')
    })

    const { result } = renderHook(() => useTimeSeries('61'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data).not.toBeNull())

    // Base = last point of prior year = 2850
    expect(result.current.data!.baseMembership).toBe(2850)
    // Current = last point of current year = 2810
    expect(result.current.data!.currentMembership).toBe(2810)
    // Change = 2810 - 2850 = -40
    expect(result.current.data!.memberChange).toBe(-40)
    expect(result.current.data!.availableYears).toEqual([
      '2025-2026',
      '2024-2025',
    ])
  })

  it('should fall back to first point of current year when prior year unavailable', async () => {
    mockFetchMetadata.mockResolvedValue({
      districtId: '61',
      lastUpdated: '2026-03-20T00:00:00.000Z',
      availableProgramYears: ['2025-2026'],
      totalDataPoints: 5,
    })

    const currentYear = makeProgramYearIndex('61', '2025-2026', [
      { date: '2025-07-15', membership: 2900, payments: 5800 },
      { date: '2025-08-15', membership: 2880, payments: 5600 },
      { date: '2026-03-19', membership: 2810, payments: 4637 },
    ])

    mockFetchProgramYear.mockResolvedValue(currentYear)

    const { result } = renderHook(() => useTimeSeries('61'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data).not.toBeNull())

    // Fallback: first point of current year = 2900
    expect(result.current.data!.baseMembership).toBe(2900)
    expect(result.current.data!.currentMembership).toBe(2810)
    expect(result.current.data!.memberChange).toBe(-90)
    expect(result.current.data!.availableYears).toEqual(['2025-2026'])
  })

  it('should handle metadata fetch failure', async () => {
    mockFetchMetadata.mockRejectedValue(new Error('CDN fetch failed: 404'))

    const { result } = renderHook(() => useTimeSeries('61'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 5000,
    })
    expect(result.current.data).toBeNull()
    expect(result.current.error?.message).toContain('404')
  })

  it('should gracefully skip years that fail to fetch', async () => {
    mockFetchMetadata.mockResolvedValue({
      districtId: '61',
      lastUpdated: '2026-03-20T00:00:00.000Z',
      availableProgramYears: ['2024-2025', '2025-2026'],
      totalDataPoints: 10,
    })

    const currentYear = makeProgramYearIndex('61', '2025-2026', [
      { date: '2026-03-19', membership: 2810, payments: 4637 },
    ])

    mockFetchProgramYear.mockImplementation(async (_id, year) => {
      if (year === '2025-2026') return currentYear
      throw new Error('Not found')
    })

    const { result } = renderHook(() => useTimeSeries('61'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data).not.toBeNull())

    // Prior year failed, fallback to first point of current year
    expect(result.current.data!.baseMembership).toBe(2810)
    expect(result.current.data!.availableYears).toEqual(['2025-2026'])
  })
})
