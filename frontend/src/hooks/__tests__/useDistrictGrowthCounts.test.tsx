/**
 * useDistrictGrowthCounts (#1794) — charter + suspension counts for the
 * DISPLAYED snapshot. Fixture: the recorded 2026-10-11 rankings file (three
 * fields per row), where D61 has 0 suspensions while 32 districts have some —
 * a measured 0, not "not collected" (#1757).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDistrictGrowthCounts } from '../useDistrictGrowthCounts'
import { fetchCdnRankingsForDate } from '../../services/cdn'
import type { CdnRankingsData } from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'
import recorded from '../../__tests__/fixtures/rankings-growth-counts-2026-10-11.recorded.json'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankingsForDate: vi.fn(),
}))
const mockedForDate = vi.mocked(fetchCdnRankingsForDate)

const file = (snapshotDate?: string): CdnRankingsData =>
  ({
    rankings: recorded.rankings,
    asOfDate: '2026-10-11',
    generatedAt: '2026-10-12T09:00:00Z',
    ...(snapshotDate ? { snapshotDate: snap(snapshotDate) } : {}),
  }) as unknown as CdnRankingsData

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useDistrictGrowthCounts', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('reads a measured 0 for D61 on the recorded date', async () => {
    mockedForDate.mockResolvedValue(file('2026-10-11'))
    const { result } = renderHook(
      () => useDistrictGrowthCounts('61', snap('2026-10-11')),
      { wrapper }
    )
    await waitFor(() =>
      expect(result.current.counts).toEqual({ chartered: 0, suspended: 0 })
    )
    expect(mockedForDate).toHaveBeenCalledWith('2026-10-11')
  })

  it('never substitutes the latest file for a missing dated one', async () => {
    mockedForDate.mockResolvedValue(file(undefined))
    const { result } = renderHook(
      () => useDistrictGrowthCounts('61', snap('2026-10-11')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.counts).toEqual({
      chartered: null,
      suspended: null,
    })
  })

  it('does not fetch without a date', () => {
    const { result } = renderHook(
      () => useDistrictGrowthCounts('61', undefined),
      { wrapper }
    )
    expect(mockedForDate).not.toHaveBeenCalled()
    expect(result.current.counts).toEqual({
      chartered: null,
      suspended: null,
    })
  })
})
