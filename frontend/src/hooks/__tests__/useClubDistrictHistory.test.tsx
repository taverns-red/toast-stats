/**
 * useClubDistrictHistory (#1817) — the whole club-district history: the
 * index, then every shard it names. Fixture: the recorded prod index and
 * shards (2026-10-15), trimmed to D61/D01 clubs.
 *
 * One missing shard makes the history `unavailable`: a fold over a partial
 * history would undercount, and an undercount must not look measured.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type {
  ClubDistrictHistoryIndex,
  ClubDistrictHistoryShard,
} from '@taverns-red/shared-contracts'
import { useClubDistrictHistory } from '../useClubDistrictHistory'
import {
  fetchClubDistrictHistoryIndex,
  fetchClubDistrictHistoryShard,
} from '../../services/cdnClubDistrictHistory'
import recordedJson from '../../__tests__/fixtures/club-district-history-d61-d01.recorded.json'

vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryIndex: vi.fn(),
  fetchClubDistrictHistoryShard: vi.fn(),
}))
const mockedIndex = vi.mocked(fetchClubDistrictHistoryIndex)
const mockedShard = vi.mocked(fetchClubDistrictHistoryShard)
const index = recordedJson.index as unknown as ClubDistrictHistoryIndex
const shards = recordedJson.shards as unknown as Record<
  string,
  ClubDistrictHistoryShard
>

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useClubDistrictHistory', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('folds every shard the index names into one club map', async () => {
    mockedIndex.mockResolvedValue(index)
    mockedShard.mockImplementation(async key => shards[key] ?? null)
    const { result } = renderHook(() => useClubDistrictHistory(), { wrapper })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockedShard).toHaveBeenCalledTimes(100)
    expect(result.current.loaded).toBe(100)
    expect(result.current.total).toBe(100)
    expect(Object.keys(result.current.clubs ?? {})).toHaveLength(515)
    expect(result.current.clubs?.['977']?.byProgramYear['2026-2027']).toBe(
      '201'
    )
    expect(result.current.index?.asOf).toBe('2026-10-13')
  })

  it('is unavailable — not partial — when one shard is missing', async () => {
    mockedIndex.mockResolvedValue(index)
    mockedShard.mockImplementation(async key =>
      key === '42' ? null : (shards[key] ?? null)
    )
    const { result } = renderHook(() => useClubDistrictHistory(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.clubs).toBeNull()
  })

  it('is unavailable when the index is missing, and fetches no shard', async () => {
    mockedIndex.mockResolvedValue(null)
    const { result } = renderHook(() => useClubDistrictHistory(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(mockedShard).not.toHaveBeenCalled()
  })
})
