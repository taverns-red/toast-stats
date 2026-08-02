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
import { useLatestAsOfDate, useGlobalFreshness } from '../useLatestAsOfDate'
import { snap } from '../../test-utils/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2026-07-02', // sourceCsvDate — advanced past the pinned month-end
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
  it('returns the global as-of date (rankings.asOfDate) and pinned latest snapshot (manifest)', async () => {
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

/**
 * `useGlobalFreshness` (#1321) owns the rule the pill sites used to hand-write:
 * the global as-of date only describes the viewed snapshot when that snapshot is
 * BOTH the district's latest AND the global pinned month-end.
 *
 * Fixtures (above) are divergence-by-default: global as-of 2026-07-02 has
 * advanced past the pinned month-end 2026-06-30 — the closing window.
 */
describe('useGlobalFreshness (#1321)', () => {
  const render = (params: Parameters<typeof useGlobalFreshness>[0]) =>
    renderHook(() => useGlobalFreshness(params), { wrapper })

  it('surfaces the global as-of date when the district latest IS the global latest', async () => {
    const { result } = render({
      districtLatestSnapshotDate: snap('2026-06-30'),
      isLatestSnapshot: true,
    })
    await waitFor(() => expect(result.current.asOfDate).toBe('2026-07-02'))
    expect(result.current.isLatest).toBe(true)
  })

  it('withholds it while viewing a historical snapshot', async () => {
    const { result } = render({
      districtLatestSnapshotDate: snap('2026-06-30'),
      isLatestSnapshot: false,
    })
    await waitFor(() => expect(result.current.isLatest).toBe(false))
    // Load-bearing: computeFreshness shows `asOfDate ?? snapshotDate`, so a
    // leaked global date would print over the historical snapshot's own.
    expect(result.current.asOfDate).toBeUndefined()
  })

  it("withholds it when the district's latest LAGS the global scrape", async () => {
    // District's newest snapshot is a month behind the global pinned month-end:
    // its data is genuinely older, so it must not claim the global as-of date
    // (nor a month-end reconciliation it isn't part of).
    const { result } = render({
      districtLatestSnapshotDate: snap('2026-05-31'),
      isLatestSnapshot: true,
    })
    await waitFor(() => expect(result.current.isLatest).toBe(false))
    expect(result.current.asOfDate).toBeUndefined()
  })

  it('is not "latest" when the district has no known snapshot date', async () => {
    const { result } = render({
      districtLatestSnapshotDate: undefined,
      isLatestSnapshot: true,
    })
    await waitFor(() => expect(result.current.isLatest).toBe(false))
    expect(result.current.asOfDate).toBeUndefined()
  })
})
