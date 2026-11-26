/**
 * The hook end to end with a cached mix of two publications (#3220): rankings
 * from one run, latest.json from another. The pure combinations live in
 * useLatestAsOfDate.publications.test.ts.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLatestAsOfDate } from '../useLatestAsOfDate'
import { fetchCdnManifest, fetchCdnRankings } from '../../services/cdn'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankings: vi.fn(),
  fetchCdnManifest: vi.fn(),
}))

afterEach(() => cleanup())

let queryClient: QueryClient

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
})

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

/** Both queries settled, so an undefined as-of date is the answer, not "loading". */
const settled = () =>
  waitFor(() => {
    expect(fetchCdnRankings).toHaveBeenCalled()
    expect(fetchCdnManifest).toHaveBeenCalled()
    expect(queryClient.isFetching()).toBe(0)
  })

function serve(
  rankings: { asOfDate: string; sourceSnapshotDate: string },
  latest: string
) {
  vi.mocked(fetchCdnRankings).mockResolvedValue({
    rankings: [],
    generatedAt: '2026-11-25T00:00:00Z',
    ...rankings,
  })
  vi.mocked(fetchCdnManifest).mockResolvedValue({
    latestSnapshotDate: latest,
    generatedAt: '2026-11-25T00:00:00Z',
  } as Awaited<ReturnType<typeof fetchCdnManifest>>)
}

describe('useLatestAsOfDate with two publications cached (#3220)', () => {
  it('shows no as-of date when rankings.json is older than latest.json', async () => {
    serve(
      { asOfDate: '2026-11-23', sourceSnapshotDate: '2026-11-23' },
      '2026-11-24'
    )
    const { result } = renderHook(() => useLatestAsOfDate(), { wrapper })
    await settled()
    expect(result.current.latestSnapshotDate).toBe('2026-11-24')
    expect(result.current.asOfDate).toBeUndefined()
  })

  it('shows no as-of date when rankings.json is newer than latest.json', async () => {
    serve(
      { asOfDate: '2026-11-24', sourceSnapshotDate: '2026-11-24' },
      '2026-11-23'
    )
    const { result } = renderHook(() => useLatestAsOfDate(), { wrapper })
    await settled()
    expect(result.current.latestSnapshotDate).toBe('2026-11-23')
    expect(result.current.asOfDate).toBeUndefined()
  })

  it('keeps the reconciliation as-of date when both name the pinned month-end', async () => {
    serve(
      { asOfDate: '2026-07-02', sourceSnapshotDate: '2026-06-30' },
      '2026-06-30'
    )
    const { result } = renderHook(() => useLatestAsOfDate(), { wrapper })
    await waitFor(() => expect(result.current.asOfDate).toBe('2026-07-02'))
  })
})

/**
 * A page that views a dates.json date (Awards, /clubs, /clubs/race) checks
 * rankings.json against that date, not latest.json, which can lag after
 * promotion while it waits for report sidecars (#3221).
 */
describe('useLatestAsOfDate with a viewed snapshot date (#3221)', () => {
  it('shows the as-of date when rankings.json matches the viewed date, even though latest.json lags', async () => {
    serve(
      { asOfDate: '2026-11-24', sourceSnapshotDate: '2026-11-24' },
      '2026-11-23'
    )
    const { result } = renderHook(
      () => useLatestAsOfDate({ viewedSnapshotDate: '2026-11-24' }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.asOfDate).toBe('2026-11-24'))
    expect(result.current.latestSnapshotDate).toBe('2026-11-23')
  })

  it('shows no as-of date when rankings.json is older than the viewed date', async () => {
    serve(
      { asOfDate: '2026-11-23', sourceSnapshotDate: '2026-11-23' },
      '2026-11-23'
    )
    const { result } = renderHook(
      () => useLatestAsOfDate({ viewedSnapshotDate: '2026-11-24' }),
      { wrapper }
    )
    await settled()
    expect(result.current.asOfDate).toBeUndefined()
  })
})
