import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GlobalTotals } from '@taverns-red/shared-contracts'
import {
  globalHistoryQueryKey,
  useGlobalClubsByCountry,
  useGlobalHistory,
} from '../useGlobalHistory'
import {
  fetchCdnGlobalHistory,
  fetchCdnGlobalTotals,
  fetchLatestSnapshotDate,
} from '../../services/cdn'
import { globalHistoryFixture } from '../../__tests__/fixtures/globalHistory'
import { snap } from '../../test-utils/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnGlobalHistory: vi.fn(),
  fetchCdnGlobalTotals: vi.fn(),
  fetchLatestSnapshotDate: vi.fn(),
}))

/**
 * #1687 — the `/history` scoreboard hooks (#1500). Every page test mocks
 * this module, so its own contract never ran: null-not-undefined when the
 * artifact is absent, the error surface, and the clubs-by-country date pin
 * (Lesson 59 — a caller's resolved date is used, "latest" is not re-resolved).
 */

const totals = (
  overrides: Partial<{
    clubsByCountry: GlobalTotals['clubsByCountry']
    clubsCounted: number
  }> = {}
): GlobalTotals =>
  ({
    membership: { clubsCounted: overrides.clubsCounted ?? 14282 },
    clubsByCountry: overrides.clubsByCountry ?? {
      countries: [{ country: 'Canada', clubs: 900 }],
      unknown: 12,
    },
  }) as unknown as GlobalTotals

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, Wrapper }
}

beforeEach(() => {
  vi.mocked(fetchCdnGlobalHistory).mockReset()
  vi.mocked(fetchCdnGlobalTotals).mockReset()
  vi.mocked(fetchLatestSnapshotDate).mockReset()
})

describe('useGlobalHistory', () => {
  it('starts loading with a null history', () => {
    vi.mocked(fetchCdnGlobalHistory).mockReturnValue(new Promise(() => {}))
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(() => useGlobalHistory(), {
      wrapper: Wrapper,
    })

    expect(result.current).toEqual({
      history: null,
      isLoading: true,
      isError: false,
    })
  })

  it('returns the published series once fetched, under the shared query key', async () => {
    vi.mocked(fetchCdnGlobalHistory).mockResolvedValue(globalHistoryFixture)
    const { client, Wrapper } = makeWrapper()

    const { result } = renderHook(() => useGlobalHistory(), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toBe(globalHistoryFixture)
    expect(result.current.isError).toBe(false)
    expect(fetchCdnGlobalHistory).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(globalHistoryQueryKey)).toBe(
      globalHistoryFixture
    )
  })

  it('maps an absent artifact (fetcher → null) to history null, not an error', async () => {
    vi.mocked(fetchCdnGlobalHistory).mockResolvedValue(null)
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(() => useGlobalHistory(), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.history).toBeNull()
    expect(result.current.isError).toBe(false)
  })

  // The hook sets its own `retry` (failureCount < 2), which overrides the
  // client's `retry: false`. A zero client retryDelay keeps the backoff out
  // of the test without changing the hook's retry policy.
  function retryingWrapper() {
    const client = new QueryClient({
      defaultOptions: { queries: { retryDelay: 0 } },
    })
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  }

  it('surfaces a persistent failure as isError after two retries (3 attempts)', async () => {
    vi.mocked(fetchCdnGlobalHistory).mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useGlobalHistory(), {
      wrapper: retryingWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchCdnGlobalHistory).toHaveBeenCalledTimes(3)
    expect(result.current.history).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('recovers when a retry succeeds after a transient failure', async () => {
    vi.mocked(fetchCdnGlobalHistory)
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue(globalHistoryFixture)

    const { result } = renderHook(() => useGlobalHistory(), {
      wrapper: retryingWrapper(),
    })

    await waitFor(() => expect(result.current.history).not.toBeNull())
    expect(fetchCdnGlobalHistory).toHaveBeenCalledTimes(2)
    expect(result.current.isError).toBe(false)
  })
})

describe('useGlobalClubsByCountry', () => {
  it('pins to the caller-supplied date and never resolves "latest"', async () => {
    vi.mocked(fetchCdnGlobalTotals).mockResolvedValue(totals())
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useGlobalClubsByCountry(snap('2026-06-30')),
      { wrapper: Wrapper }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchLatestSnapshotDate).not.toHaveBeenCalled()
    expect(fetchCdnGlobalTotals).toHaveBeenCalledWith('2026-06-30')
    expect(result.current.snapshotDate).toBe('2026-06-30')
    expect(result.current.clubsCounted).toBe(14282)
    expect(result.current.clubsByCountry).toEqual(totals().clubsByCountry)
  })

  it('resolves the latest snapshot date when none is given and reports it', async () => {
    vi.mocked(fetchLatestSnapshotDate).mockResolvedValue(snap('2026-09-30'))
    vi.mocked(fetchCdnGlobalTotals).mockResolvedValue(
      totals({ clubsCounted: 15016 })
    )
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(() => useGlobalClubsByCountry(), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchLatestSnapshotDate).toHaveBeenCalledTimes(1)
    expect(fetchCdnGlobalTotals).toHaveBeenCalledWith('2026-09-30')
    expect(result.current.snapshotDate).toBe('2026-09-30')
    expect(result.current.clubsCounted).toBe(15016)
  })

  it('keeps the resolved date but nulls the table when the totals file is absent', async () => {
    vi.mocked(fetchCdnGlobalTotals).mockResolvedValue(null)
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => useGlobalClubsByCountry(snap('2026-06-30')),
      { wrapper: Wrapper }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clubsByCountry).toBeNull()
    expect(result.current.clubsCounted).toBeNull()
    expect(result.current.snapshotDate).toBe('2026-06-30')
    expect(result.current.isError).toBe(false)
  })

  it('surfaces a failed "latest" resolution as isError without fetching totals', async () => {
    vi.mocked(fetchLatestSnapshotDate).mockRejectedValue(
      new Error('manifest down')
    )
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(() => useGlobalClubsByCountry(), {
      wrapper: Wrapper,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchCdnGlobalTotals).not.toHaveBeenCalled()
    expect(result.current.snapshotDate).toBeNull()
    expect(result.current.clubsByCountry).toBeNull()
  })

  it('keys pinned and latest queries separately (no cross-talk)', async () => {
    vi.mocked(fetchLatestSnapshotDate).mockResolvedValue(snap('2026-09-30'))
    vi.mocked(fetchCdnGlobalTotals).mockImplementation(async date =>
      totals({ clubsCounted: date === '2026-06-30' ? 1 : 2 })
    )
    const { Wrapper } = makeWrapper()

    const { result } = renderHook(
      () => ({
        pinned: useGlobalClubsByCountry(snap('2026-06-30')),
        latest: useGlobalClubsByCountry(),
      }),
      { wrapper: Wrapper }
    )

    await waitFor(() => {
      expect(result.current.pinned.isLoading).toBe(false)
      expect(result.current.latest.isLoading).toBe(false)
    })
    expect(result.current.pinned.clubsCounted).toBe(1)
    expect(result.current.latest.clubsCounted).toBe(2)
  })
})
