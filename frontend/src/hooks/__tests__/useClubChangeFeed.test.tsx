import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { PerDistrictData } from '@taverns-red/shared-contracts'
import { useClubChangeFeed } from '../useClubChangeFeed'
import { fetchCdnDistrictSnapshot } from '../../services/cdn'
import { useDistrictCachedDates } from '../useDistrictData'
import { snap } from '../../test-utils/snapshotDate'
import recorded from '../../__tests__/fixtures/club-change-feed-d61.recorded.json'

vi.mock('../../services/cdn', () => ({
  fetchCdnDistrictSnapshot: vi.fn(),
}))
vi.mock('../useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(),
}))

const SNAPS = recorded.snapshots as unknown as Record<string, PerDistrictData>
const DATES = Object.keys(SNAPS).sort().map(snap)
const mockedFetch = vi.mocked(fetchCdnDistrictSnapshot)
const mockedDates = vi.mocked(useDistrictCachedDates)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedDates.mockReturnValue({
    data: {
      districtId: '61',
      dates: DATES,
      count: DATES.length,
      dateRange: null,
    },
    isPending: false,
  } as unknown as ReturnType<typeof useDistrictCachedDates>)
})

describe('useClubChangeFeed (#2430)', () => {
  it('reads nothing until the page enables it', () => {
    const { result } = renderHook(
      () => useClubChangeFeed('61', '7238597', snap('2026-10-31'), false),
      { wrapper }
    )
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(result.current.feed).toBeNull()
  })

  it('fetches the picked dates and turns a missing file into a reported gap', async () => {
    mockedFetch.mockImplementation(async (date: string) => {
      if (date === '2026-10-15') throw new Error('CDN 404')
      return SNAPS[date] as never
    })
    const { result } = renderHook(
      () => useClubChangeFeed('61', '7238597', snap('2026-10-31'), true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.feed).not.toBeNull())
    expect(mockedFetch).toHaveBeenCalledTimes(DATES.length)
    const feed = result.current.feed!
    expect(feed.unavailableDates).toEqual(['2026-10-15'])
    expect(feed.entries.map(e => [e.toDate, e.text])).toEqual([
      ['2026-10-31', 'Gained 1 member'],
      ['2026-10-31', 'Recorded 1 new payment (1 October renewal)'],
      ['2026-10-08', 'Lost 7 members'],
      ['2026-09-30', 'Met 1 more DCP goal'],
    ])
    expect(result.current.isLoading).toBe(false)
  })

  it('treats a failed collection as a gap', async () => {
    mockedFetch.mockImplementation(async (date: string) => {
      const file = SNAPS[date]!
      return (
        date === '2026-10-22' ? { ...file, status: 'failed' } : file
      ) as never
    })
    const { result } = renderHook(
      () => useClubChangeFeed('61', '7238597', snap('2026-10-31'), true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.feed).not.toBeNull())
    expect(result.current.feed!.unavailableDates).toEqual(['2026-10-22'])
  })
})
