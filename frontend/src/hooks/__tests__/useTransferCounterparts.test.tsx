/* useTransferCounterparts (#1806) — joins a diff's realignment transfers to
   the club-district history (#1782) so the Changes feed can say "transferred
   to District 201". Lazy: no shard is fetched unless the diff carries a
   transfer, and then only the shards holding those clubs. */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { ReactNode } from 'react'
import type { DiffEvent, SnapshotDiff } from '@taverns-red/shared-contracts'
import { useTransferCounterparts } from '../useTransferCounterparts'
import { fetchClubDistrictHistoryShard } from '../../services/clubDistrictHistory'
import shardFixture from '../../__tests__/fixtures/club-district-history-shard-77.recorded.json'

vi.mock('../../services/clubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn(),
}))
const mockedShard = vi.mocked(fetchClubDistrictHistoryShard)

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const transfer = (
  category: DiffEvent['category'],
  clubId: string
): DiffEvent => ({
  category,
  clubId,
  clubName: 'Club',
  label:
    'Club (Active) moved to another district in the 2026 district realignment',
  magnitude: -1,
})

type DiffSlice = Pick<SnapshotDiff, 'events' | 'rosterDiscontinuity'>

const realigned = (events: DiffEvent[]): DiffSlice => ({
  events,
  rosterDiscontinuity: {
    kind: 'program-year-boundary',
    fromProgramYear: '2025-2026',
    toProgramYear: '2026-2027',
    clubsMovedIn: 0,
    clubsMovedOut: events.length,
  },
})

describe('useTransferCounterparts (#1806)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedShard.mockResolvedValue(
      shardFixture as Awaited<ReturnType<typeof fetchClubDistrictHistoryShard>>
    )
  })

  it('maps each transferred club to the district on the other side', async () => {
    const diff = realigned([
      transfer('club-transferred-out', '00000977'),
      transfer('club-transferred-out', '77'),
    ])
    const { result } = renderHook(() => useTransferCounterparts(diff, '01'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.get('977')).toBe('201'))
    // Club 77 left D36, not D01 — the history still names its to-PY district.
    expect(result.current.get('77')).toBe('220')
    // Both clubs live in shard 77: one fetch, not one per club.
    expect(mockedShard).toHaveBeenCalledTimes(1)
    expect(mockedShard).toHaveBeenCalledWith('77')
  })

  it('fetches nothing for a diff without transfers', () => {
    const { result } = renderHook(
      () =>
        useTransferCounterparts(
          {
            events: [{ ...transfer('club-removed', '977') }],
          },
          '01'
        ),
      { wrapper }
    )
    expect(result.current.size).toBe(0)
    expect(mockedShard).not.toHaveBeenCalled()
  })

  it('fetches nothing before the diff has loaded', () => {
    const { result } = renderHook(
      () => useTransferCounterparts(undefined, '01'),
      { wrapper }
    )
    expect(result.current.size).toBe(0)
    expect(mockedShard).not.toHaveBeenCalled()
  })

  it('a failed shard leaves the map empty (labels stay as today)', async () => {
    mockedShard.mockRejectedValue(new Error('CDN 404'))
    const { result } = renderHook(
      () =>
        useTransferCounterparts(
          realigned([transfer('club-transferred-out', '977')]),
          '01'
        ),
      { wrapper }
    )
    await waitFor(() => expect(mockedShard).toHaveBeenCalled())
    expect(result.current.size).toBe(0)
  })
})
