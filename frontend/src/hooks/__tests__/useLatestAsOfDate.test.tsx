/**
 * useLatestAsOfDate (#1310) — the GLOBAL "as of" date (sourceCsvDate) + the
 * global pinned latest-snapshot date, for pages that render the freshness pill
 * but don't fetch a per-district snapshot (the district detail/subnav header,
 * AwardsPage). Sources the as-of date from rankings.json (`date`) and the pinned
 * month-end from the CDN manifest.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLatestAsOfDate } from '../useLatestAsOfDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    date: '2026-07-02', // sourceCsvDate — advanced past the pinned month-end
    generatedAt: '2026-07-02T00:00:00Z',
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-06-30', // pinned month-end during reconciliation
    generatedAt: '2026-07-02T00:00:00Z',
  }),
}))

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useLatestAsOfDate (#1310)', () => {
  it('returns the global as-of date (rankings.date) and pinned latest snapshot (manifest)', async () => {
    const { result } = renderHook(() => useLatestAsOfDate(), { wrapper })
    await waitFor(() => expect(result.current.asOfDate).toBe('2026-07-02'))
    expect(result.current.latestSnapshotDate).toBe('2026-06-30')
  })

  it('returns undefined dates before the queries resolve (no crash)', () => {
    const { result } = renderHook(() => useLatestAsOfDate(), { wrapper })
    // Synchronous first render — nothing fetched yet.
    expect(result.current.asOfDate).toBeUndefined()
    expect(result.current.latestSnapshotDate).toBeUndefined()
  })
})
