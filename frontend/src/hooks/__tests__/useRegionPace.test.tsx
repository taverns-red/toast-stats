/* useRegionPace (#2307) — loads last year's pace for the Region page's
   on-track line: the reference year's rankings on the same day (or the
   nearest earlier snapshot) and its June 30 tiers. Fixture: a real subset
   of snapshots/2025-09-30/all-districts-rankings.json (after the CSP-rule
   rebuild) and snapshots/2026-06-30/competitive-awards.json. */

import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRegionPace } from '../useRegionPace'
import {
  fetchCdnDates,
  fetchCdnRankingsForDateExact,
  fetchCdnCompetitiveAwards,
  type CdnRankingsData,
  type CompetitiveAwardStandings,
} from '../../services/cdn'
import recorded from '../../__tests__/fixtures/region-pace-2025-26.recorded.json'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn(),
  fetchCdnRankingsForDateExact: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn(),
}))
const mockedDates = vi.mocked(fetchCdnDates)
const mockedRankings = vi.mocked(fetchCdnRankingsForDateExact)
const mockedAwards = vi.mocked(fetchCdnCompetitiveAwards)

const DATES = ['2025-08-31', '2025-09-30', '2025-10-31', '2026-06-30']

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const ready = () => {
  mockedDates.mockResolvedValue({ dates: DATES, count: DATES.length } as never)
  mockedRankings.mockResolvedValue(
    recorded.rankings as unknown as CdnRankingsData
  )
  mockedAwards.mockResolvedValue(
    recorded.awards as unknown as CompetitiveAwardStandings
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useRegionPace (#2307)', () => {
  it('measures 2026-27 against 2025-26 on the same day last year', async () => {
    ready()
    const { result } = renderHook(
      () => useRegionPace('2026-2027', '2026-09-30'),
      { wrapper }
    )
    await waitFor(() => expect(result.current.medians).not.toBeNull())
    expect(mockedRankings).toHaveBeenCalledWith('2025-09-30')
    expect(mockedAwards).toHaveBeenCalledWith('2026-06-30')
    expect(result.current.reference).toEqual({
      referenceDate: '2025-09-30',
      referenceProgramYear: '2025-2026',
    })
    const m = result.current.medians!
    // Expected values computed independently from the recorded objects.
    expect(m.Distinguished!.districts).toBe(6)
    expect(m.Distinguished!.clubs).toBeCloseTo(1.011050061050061, 12)
    expect(m.Distinguished!.payments).toBeCloseTo(0.4446085938540904, 12)
    expect(m.Distinguished!.distinguished).toBe(0)
    expect(m.Smedley!.districts).toBe(2)
    expect(m.Smedley!.payments).toBeCloseTo(0.5232915903311604, 12)
  })

  it('has no pace for a program year without a verified reference year', async () => {
    ready()
    const { result } = renderHook(
      () => useRegionPace('2025-2026', '2026-03-31'),
      { wrapper }
    )
    await waitFor(() => expect(mockedDates).toHaveBeenCalled())
    expect(result.current.reference).toBeNull()
    expect(result.current.medians).toBeNull()
    expect(mockedRankings).not.toHaveBeenCalled()
  })

  it('has no pace when the reference year-end snapshot is missing', async () => {
    ready()
    mockedDates.mockResolvedValue({
      dates: ['2025-09-30'],
      count: 1,
    } as never)
    const { result } = renderHook(
      () => useRegionPace('2026-2027', '2026-10-25'),
      { wrapper }
    )
    await waitFor(() => expect(mockedDates).toHaveBeenCalled())
    expect(result.current.medians).toBeNull()
    expect(mockedAwards).not.toHaveBeenCalled()
  })
})
