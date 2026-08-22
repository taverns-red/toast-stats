/**
 * useDistrictRankHistoryYears (#1436)
 *
 * The degraded "limited data" view on DistrictDetailPage is only reachable for
 * a district with NO `district-snapshot-index.json` entry (districts that DO
 * have one self-heal to their newest data year via the page's auto-select
 * effect — #1398). For such a district `index[id] ?? []` is empty, so a year
 * selector fed from the snapshot index would render with nothing in it.
 *
 * Its rank history is the only record of the years it exists in:
 * `v1/rank-history/{id}.json` is written for every district that ever appeared
 * in any all-districts-rankings.json (data-pipeline.yml, "Building per-district
 * rank history").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankHistory: vi.fn(),
}))

import { fetchCdnRankHistory } from '../../services/cdn'
import {
  programYearsFromRankHistory,
  useDistrictRankHistoryYears,
} from '../useDistrictRankHistoryYears'

const mockedFetch = vi.mocked(fetchCdnRankHistory)

function point(date: string) {
  return {
    date,
    aggregateScore: 100,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    totalDistricts: 128,
    overallRank: 41,
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('programYearsFromRankHistory (#1436)', () => {
  it('derives the program years a district appears in, newest first', () => {
    const years = programYearsFromRankHistory([
      { date: '2024-12-31' },
      { date: '2025-06-30' },
      { date: '2026-01-15' },
    ])

    expect(years.map(py => py.label)).toEqual(['2025-2026', '2024-2025'])
  })

  it('returns an empty list for a district with no rank history', () => {
    expect(programYearsFromRankHistory([])).toEqual([])
  })

  it('drops unparseable dates rather than minting a NaN-NaN year (#1353)', () => {
    const years = programYearsFromRankHistory([
      { date: 'not-a-date' },
      { date: '2025-06-30' },
    ])

    expect(years.map(py => py.label)).toEqual(['2024-2025'])
  })
})

describe('useDistrictRankHistoryYears (#1436)', () => {
  it('does not fetch while disabled — the happy path adds no request', () => {
    const { result } = renderHook(
      () => useDistrictRankHistoryYears('44', false),
      { wrapper }
    )

    expect(mockedFetch).not.toHaveBeenCalled()
    expect(result.current.programYears).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('returns the years the district appears in when enabled', async () => {
    mockedFetch.mockResolvedValue({
      districtId: '44',
      districtName: '44',
      history: [point('2024-12-31'), point('2025-06-30')],
    })

    const { result } = renderHook(
      () => useDistrictRankHistoryYears('44', true),
      { wrapper }
    )

    await waitFor(() =>
      expect(result.current.programYears.map(py => py.label)).toEqual([
        '2024-2025',
      ])
    )
    expect(mockedFetch).toHaveBeenCalledWith('44')
  })

  it('degrades to an empty list when the rank history 404s', async () => {
    mockedFetch.mockRejectedValue(new Error('404'))

    const { result } = renderHook(
      () => useDistrictRankHistoryYears('999', true),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.programYears).toEqual([])
  })
})
