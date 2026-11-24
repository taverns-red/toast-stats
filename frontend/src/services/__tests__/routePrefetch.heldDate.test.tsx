/**
 * routePrefetch with a held date (#3195): the district index runs one day
 * ahead of v1/latest.json, so the club route must prefetch the manifest's
 * snapshot, the one the page opens on, and mounting must refetch nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { prefetchRouteData } from '../routePrefetch'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import { snap } from '../../test-utils/snapshotDate'

const BODIES: Record<string, unknown> = {
  '/config/district-snapshot-index.json': {
    generatedAt: '2026-10-12T00:00:00Z',
    districts: { '61': ['2026-06-30', '2026-10-11', '2026-10-12'] },
  },
  '/v1/latest.json': {
    latestSnapshotDate: '2026-10-11',
    generatedAt: '2026-10-12T00:00:00Z',
  },
  '/snapshots/2026-10-11/district_61.json': { districtId: '61', clubs: [] },
}

let fetchMock: ReturnType<typeof vi.fn>
const urls = (): string[] => fetchMock.mock.calls.map(c => String(c[0]))

beforeEach(() => {
  fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input)
    const key = Object.keys(BODIES).find(k => url.endsWith(k))
    if (!key) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(BODIES[key]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('prefetchRouteData — manifest read (#3195)', () => {
  it('reads the manifest alongside the index on the district overview', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    prefetchRouteData(client, { pathname: '/district/61', search: '' })
    await waitFor(() => expect(urls()).toHaveLength(2))
    await new Promise(r => setTimeout(r, 20))
    expect(urls().sort()).toEqual([
      expect.stringMatching(/\/config\/district-snapshot-index\.json$/),
      expect.stringMatching(/\/v1\/latest\.json$/),
    ])
  })

  it('requests exactly the index and the manifest on a club deep link', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    prefetchRouteData(client, {
      pathname: '/district/61/club/7238597',
      search: '?date=2026-10-11',
    })
    await waitFor(() => expect(urls()).toHaveLength(2))
    await new Promise(r => setTimeout(r, 20))
    expect(urls().sort()).toEqual([
      expect.stringMatching(/\/config\/district-snapshot-index\.json$/),
      expect.stringMatching(/\/v1\/latest\.json$/),
    ])
  })
})

describe('prefetchRouteData — club route on a held day (#3195)', () => {
  it('prefetches the manifest date, not the held one, and mounting refetches nothing', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    prefetchRouteData(client, {
      pathname: '/district/61/club/7238597',
      search: '',
    })
    await waitFor(() => expect(urls()).toHaveLength(3))
    expect(urls().some(u => u.includes('/snapshots/2026-10-12/'))).toBe(false)
    expect(
      urls().some(u => u.endsWith('/snapshots/2026-10-11/district_61.json'))
    ).toBe(true)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => ({
        dates: useDistrictCachedDates('61'),
        stats: useDistrictStatistics('61', snap('2026-10-11')),
      }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.stats.isSuccess).toBe(true))
    await waitFor(() =>
      expect(result.current.dates.data?.dateRange?.endDate).toBe('2026-10-11')
    )
    expect(urls()).toHaveLength(3)
  })
})
