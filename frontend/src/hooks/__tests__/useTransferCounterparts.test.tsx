/* useTransferCounterparts (#1806) — joins a diff's realignment transfers to
   the club-district history (#1782) so the Changes feed can say "transferred
   to District 201". Lazy: no shard is fetched unless the diff carries a
   transfer, and then only the shards holding those clubs. */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { ReactNode } from 'react'
import type { DiffEvent, SnapshotDiff } from '@taverns-red/shared-contracts'
import {
  TRANSFER_COUNTERPART_SHARD_BUDGET,
  useTransferCounterparts,
} from '../useTransferCounterparts'
import { fetchClubDistrictHistoryShard } from '../../services/cdnClubDistrictHistory'
import shardFixture from '../../__tests__/fixtures/club-district-history-shard-77.recorded.json'

vi.mock('../../services/cdnClubDistrictHistory', () => ({
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
    await waitFor(() =>
      expect(result.current.counterparts.get('977')).toBe('201')
    )
    // Club 77 left D36, not D01 — the history still names its to-PY district.
    expect(result.current.counterparts.get('77')).toBe('220')
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
    expect(result.current.counterparts.size).toBe(0)
    expect(mockedShard).not.toHaveBeenCalled()
  })

  it('fetches nothing before the diff has loaded', () => {
    const { result } = renderHook(
      () => useTransferCounterparts(undefined, '01'),
      { wrapper }
    )
    expect(result.current.counterparts.size).toBe(0)
    expect(mockedShard).not.toHaveBeenCalled()
  })

  it('a failed shard leaves the map empty (labels stay as today)', async () => {
    mockedShard.mockResolvedValue(null) // the reader's "not available"
    const { result } = renderHook(
      () =>
        useTransferCounterparts(
          realigned([transfer('club-transferred-out', '977')]),
          '01'
        ),
      { wrapper }
    )
    await waitFor(() => expect(mockedShard).toHaveBeenCalled())
    expect(result.current.counterparts.size).toBe(0)
  })
})

/* #2063: a realignment diff can touch ~59 of the 100 shards (~0.67 MB gz on
   the D36/D220 case). Up front the view fetches at most a budget of shards,
   picked in display order (moved in, then moved out); the rest wait for an
   explicit "load more". */
describe('useTransferCounterparts — per-view byte budget (#2063)', () => {
  // The largest shard measured on the prod CDN (2026-10-17, D36/D220 case).
  const MEASURED_MAX_SHARD_GZ_BYTES = 12_838
  const VIEW_BUDGET_BYTES = 500_000

  beforeEach(() => {
    vi.clearAllMocks()
    mockedShard.mockResolvedValue(null)
  })

  // Clubs 100..158 sit in 59 distinct shards ('00'..'58').
  const manyShards = (n: number, category: DiffEvent['category']) =>
    Array.from({ length: n }, (_, i) => transfer(category, String(100 + i)))

  it('the shard budget fits 500 KB at the measured shard size', () => {
    expect(TRANSFER_COUNTERPART_SHARD_BUDGET).toBeGreaterThan(0)
    expect(
      TRANSFER_COUNTERPART_SHARD_BUDGET * MEASURED_MAX_SHARD_GZ_BYTES
    ).toBeLessThanOrEqual(VIEW_BUDGET_BYTES)
  })

  it('fetches no more than the budget up front and reports the rest as deferred', async () => {
    const diff = realigned(manyShards(59, 'club-transferred-in'))
    const { result } = renderHook(() => useTransferCounterparts(diff, '01'), {
      wrapper,
    })
    await waitFor(() =>
      expect(mockedShard).toHaveBeenCalledTimes(
        TRANSFER_COUNTERPART_SHARD_BUDGET
      )
    )
    // The first rows' shards, in display order.
    expect(mockedShard).toHaveBeenCalledWith('00')
    expect(mockedShard).not.toHaveBeenCalledWith('58')
    expect(result.current.deferred.size).toBe(
      59 - TRANSFER_COUNTERPART_SHARD_BUDGET
    )
    expect(result.current.deferred.has('158')).toBe(true)
    expect(result.current.deferred.has('100')).toBe(false)
  })

  it('a club sharing a loaded shard is not deferred, wherever it sits', () => {
    const events = [
      ...manyShards(59, 'club-transferred-in'),
      // Shard '00' is in the first batch, so this late row is covered.
      transfer('club-transferred-in', '200'),
    ]
    const { result } = renderHook(
      () => useTransferCounterparts(realigned(events), '01'),
      { wrapper }
    )
    expect(result.current.deferred.has('200')).toBe(false)
    expect(result.current.deferred.size).toBe(
      59 - TRANSFER_COUNTERPART_SHARD_BUDGET
    )
  })

  it('loads moved-in rows first, as the page lists them', async () => {
    const events = [
      ...manyShards(TRANSFER_COUNTERPART_SHARD_BUDGET, 'club-transferred-out'),
      transfer('club-transferred-in', '199'), // shard '99'
    ]
    const { result } = renderHook(
      () => useTransferCounterparts(realigned(events), '01'),
      { wrapper }
    )
    await waitFor(() => expect(mockedShard).toHaveBeenCalledWith('99'))
    expect(result.current.deferred.has('199')).toBe(false)
    expect(result.current.deferred.size).toBe(1)
  })

  it('loadMore fetches the next batch, again within the budget', async () => {
    const diff = realigned(manyShards(59, 'club-transferred-in'))
    const { result } = renderHook(() => useTransferCounterparts(diff, '01'), {
      wrapper,
    })
    await waitFor(() =>
      expect(mockedShard).toHaveBeenCalledTimes(
        TRANSFER_COUNTERPART_SHARD_BUDGET
      )
    )
    act(() => result.current.loadMore())
    await waitFor(() => expect(mockedShard).toHaveBeenCalledTimes(59))
    expect(mockedShard).toHaveBeenCalledWith('58')
    expect(result.current.deferred.size).toBe(0)
  })

  it('a new diff starts again from the first batch', () => {
    const first = realigned(manyShards(59, 'club-transferred-in'))
    const { result, rerender } = renderHook(
      ({ d }) => useTransferCounterparts(d, '01'),
      { wrapper, initialProps: { d: first } }
    )
    act(() => result.current.loadMore())
    expect(result.current.deferred.size).toBe(0)
    rerender({ d: realigned(manyShards(59, 'club-transferred-out')) })
    expect(result.current.deferred.size).toBe(
      59 - TRANSFER_COUNTERPART_SHARD_BUDGET
    )
  })
})
