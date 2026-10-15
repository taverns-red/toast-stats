/**
 * useSuspendedClubs (#1794, data from #1953) — the district's suspended-
 * this-PY clubs for the DISPLAYED snapshot (R3). Fixture: the recorded
 * 2026-10-13 file, where D61 is a measured `[]` and D83 lists 3 clubs.
 * `null` means "not measured" and must never collapse into `[]`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SuspendedClubs } from '@taverns-red/shared-contracts'
import { useSuspendedClubs } from '../useSuspendedClubs'
import { fetchCdnSuspendedClubs } from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'
import recordedJson from '../../__tests__/fixtures/suspended-clubs-2026-10-13.recorded.json'

vi.mock('../../services/cdn', () => ({
  fetchCdnSuspendedClubs: vi.fn(),
}))
const mocked = vi.mocked(fetchCdnSuspendedClubs)
const recorded = recordedJson as unknown as SuspendedClubs

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useSuspendedClubs', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('lists the recorded D83 clubs for the displayed date', async () => {
    mocked.mockResolvedValue(recorded)
    const { result } = renderHook(
      () => useSuspendedClubs('83', snap('2026-10-13')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.clubs).toHaveLength(3))
    expect(mocked).toHaveBeenCalledWith('2026-10-13')
    expect(result.current.clubs?.map(c => c.clubNumber)).toEqual([
      '1380016',
      '875053',
      '28678052',
    ])
  })

  it('keeps a measured zero as an empty list', async () => {
    mocked.mockResolvedValue(recorded)
    const { result } = renderHook(
      () => useSuspendedClubs('61', snap('2026-10-13')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clubs).toEqual([])
  })

  it('is null — not measured — when the date has no file', async () => {
    mocked.mockResolvedValue(null)
    const { result } = renderHook(
      () => useSuspendedClubs('61', snap('2026-10-12')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clubs).toBeNull()
  })

  it('is null when the district is absent from the file', async () => {
    mocked.mockResolvedValue(recorded)
    const { result } = renderHook(
      () => useSuspendedClubs('999', snap('2026-10-13')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clubs).toBeNull()
  })

  it('never uses another date’s file', async () => {
    mocked.mockResolvedValue(recorded)
    const { result } = renderHook(
      () => useSuspendedClubs('83', snap('2026-10-14')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clubs).toBeNull()
  })

  it('does not fetch without a date', () => {
    const { result } = renderHook(() => useSuspendedClubs('83', undefined), {
      wrapper,
    })
    expect(mocked).not.toHaveBeenCalled()
    expect(result.current.clubs).toBeNull()
  })
})
