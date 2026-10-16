/**
 * useCharterCohortSurvival (#2061) — the survival page's curves. It reads
 * the district's precomputed file (a few KB) and fetches no history shard.
 * Until the file is on prod (a 404 resolves `null`), it falls back to the
 * whole club-district history and folds it in the browser, as #2059 did.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  CharterCohortSurvivalFileSchema,
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  buildCharterCohortSurvival,
  type ClubDistrictHistoryClub,
} from '@taverns-red/shared-contracts'
import { useCharterCohortSurvival } from '../useCharterCohortSurvival'
import { fetchCharterCohortSurvival } from '../../services/cdnCharterCohortSurvival'
import {
  useClubDistrictHistory,
  type ClubDistrictHistoryState,
} from '../useClubDistrictHistory'
import recorded from '../../__tests__/fixtures/club-district-history-d61-d01.recorded.json'
import d61 from '../../__tests__/fixtures/charter-cohort-survival-d61.json'

vi.mock('../../services/cdnCharterCohortSurvival', () => ({
  fetchCharterCohortSurvival: vi.fn(),
}))
vi.mock('../useClubDistrictHistory', () => ({
  useClubDistrictHistory: vi.fn(),
}))
const mockedFile = vi.mocked(fetchCharterCohortSurvival)
const mockedHistory = vi.mocked(useClubDistrictHistory)

const file = CharterCohortSurvivalFileSchema.parse(d61)
const index = ClubDistrictHistoryIndexSchema.parse(recorded.index)
const clubs: Record<string, ClubDistrictHistoryClub> = {}
for (const raw of Object.values(recorded.shards)) {
  Object.assign(clubs, ClubDistrictHistoryShardSchema.parse(raw).clubs)
}
const idle: ClubDistrictHistoryState = {
  status: 'loading',
  loaded: 0,
  total: 0,
  index: null,
  clubs: null,
}
const ready: ClubDistrictHistoryState = {
  status: 'ready',
  loaded: 100,
  total: 100,
  index,
  clubs,
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const expected = (through: string) =>
  buildCharterCohortSurvival({
    index,
    clubs,
    districtId: '61',
    throughProgramYear: through,
  })

describe('useCharterCohortSurvival (#2061)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('reads the district file and never turns the history shards on', async () => {
    mockedFile.mockResolvedValue(file)
    mockedHistory.mockReturnValue(idle)
    const { result } = renderHook(
      () => useCharterCohortSurvival('61', '2024-2025'),
      { wrapper }
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockedFile).toHaveBeenCalledWith('61')
    expect(result.current.source).toBe('file')
    expect(result.current.survival).toEqual(expected('2024-2025'))
    expect(mockedHistory.mock.calls.every(([o]) => o?.enabled === false)).toBe(
      true
    )
  })

  it('falls back to folding the shards when the file is missing (404)', async () => {
    mockedFile.mockResolvedValue(null)
    mockedHistory.mockImplementation(o => (o?.enabled ? ready : idle))
    const { result } = renderHook(
      () => useCharterCohortSurvival('61', '2026-2027'),
      { wrapper }
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.source).toBe('shards')
    expect(result.current.survival).toEqual(expected('2026-2027'))
  })

  it('reports shard progress while the fallback loads', async () => {
    mockedFile.mockResolvedValue(null)
    mockedHistory.mockImplementation(o =>
      o?.enabled ? { ...idle, loaded: 37, total: 100 } : idle
    )
    const { result } = renderHook(
      () => useCharterCohortSurvival('61', '2026-2027'),
      { wrapper }
    )
    await waitFor(() => expect(result.current.total).toBe(100))
    expect(result.current.status).toBe('loading')
    expect(result.current.loaded).toBe(37)
    expect(result.current.survival).toBeNull()
  })

  it('is unavailable when the file is missing and the history is too', async () => {
    mockedFile.mockResolvedValue(null)
    mockedHistory.mockImplementation(o =>
      o?.enabled ? { ...idle, status: 'unavailable' } : idle
    )
    const { result } = renderHook(
      () => useCharterCohortSurvival('61', '2026-2027'),
      { wrapper }
    )
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.survival).toBeNull()
  })

  it('waits — loading, nothing fetched — until the program year is known', () => {
    mockedHistory.mockReturnValue(idle)
    const { result } = renderHook(() => useCharterCohortSurvival('61', null), {
      wrapper,
    })
    expect(result.current.status).toBe('loading')
    expect(result.current.survival).toBeNull()
  })
})
