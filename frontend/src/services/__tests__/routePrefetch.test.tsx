/**
 * routePrefetch (#1901 option A) — the club route's LCP chain was
 * entry → route chunk → snapshot index → district_N.json → paint. The index
 * request only started once the lazy route chunk mounted. Prefetching from the
 * entry starts the index (and then the district's latest snapshot) while the
 * route chunk downloads.
 *
 * The prefetch must SEED the exact query entries the page reads — otherwise
 * the page fetches the same files again — and must not fire on routes that do
 * not read them, or on deep links (`?py=` / `?date=`) whose snapshot date
 * differs from the district's latest.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { prefetchRouteData } from '../routePrefetch'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import { snap } from '../../test-utils/snapshotDate'

const INDEX = {
  generatedAt: '2026-10-12T00:00:00Z',
  districts: {
    '61': ['2026-06-30', '2026-10-11', '2026-10-12'],
    '42': ['2026-10-12'],
  },
}
const SNAPSHOT = { districtId: '61', clubs: [] }

let fetchMock: ReturnType<typeof vi.fn>

function urls(): string[] {
  return fetchMock.mock.calls.map(c => String(c[0]))
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

beforeEach(() => {
  fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input)
    const body = url.endsWith('/config/district-snapshot-index.json')
      ? INDEX
      : url.endsWith('/snapshots/2026-10-12/district_61.json')
        ? SNAPSHOT
        : null
    if (body === null) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(body), {
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

describe('prefetchRouteData — club route', () => {
  it('fetches the snapshot index, then the district latest snapshot', async () => {
    const client = makeClient()
    prefetchRouteData(client, {
      pathname: '/district/61/club/7238597',
      search: '',
    })
    await waitFor(() => expect(urls()).toHaveLength(2))
    expect(urls()[0]).toMatch(/\/config\/district-snapshot-index\.json$/)
    expect(urls()[1]).toMatch(/\/snapshots\/2026-10-12\/district_61\.json$/)
  })

  it('seeds the entries the page reads, so mounting refetches nothing', async () => {
    const client = makeClient()
    prefetchRouteData(client, {
      pathname: '/district/61/club/7238597',
      search: '',
    })
    await waitFor(() => expect(urls()).toHaveLength(2))

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => ({
        dates: useDistrictCachedDates('61'),
        stats: useDistrictStatistics('61', snap('2026-10-12')),
      }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.stats.isSuccess).toBe(true))
    expect(result.current.dates.data?.dateRange?.endDate).toBe('2026-10-12')
    expect(urls()).toHaveLength(2)
  })

  it('shares an in-flight prefetch with a page that mounts before it lands', async () => {
    const client = makeClient()
    prefetchRouteData(client, {
      pathname: '/district/61/club/7238597',
      search: '',
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useDistrictCachedDates('61'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(urls()).toHaveLength(2))
    expect(
      urls().filter(u => u.endsWith('/config/district-snapshot-index.json'))
    ).toHaveLength(1)
  })

  it.each(['?py=2025', '?date=2026-10-11', '?py=2025&date=2025-06-30'])(
    'prefetches the index but not a guessed snapshot on a deep link (%s)',
    async search => {
      const client = makeClient()
      prefetchRouteData(client, {
        pathname: '/district/61/club/7238597',
        search,
      })
      await waitFor(() => expect(urls()).toHaveLength(1))
      await new Promise(r => setTimeout(r, 20))
      expect(urls()).toHaveLength(1)
      expect(urls()[0]).toMatch(/\/config\/district-snapshot-index\.json$/)
    }
  )

  it('does not prefetch a snapshot for a district missing from the index', async () => {
    const client = makeClient()
    prefetchRouteData(client, {
      pathname: '/district/99/club/1',
      search: '',
    })
    await waitFor(() => expect(urls()).toHaveLength(1))
    await new Promise(r => setTimeout(r, 20))
    expect(urls()).toHaveLength(1)
  })
})

describe('prefetchRouteData — other routes', () => {
  it.each([
    '/',
    '/district/61',
    '/district/61/clubs',
    '/district/61/club/7238597/history',
    '/club/7238597',
    '/district/61/division/A',
  ])('fetches nothing on %s', async pathname => {
    const client = makeClient()
    prefetchRouteData(client, { pathname, search: '' })
    await new Promise(r => setTimeout(r, 20))
    expect(urls()).toHaveLength(0)
  })
})
