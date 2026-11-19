/**
 * useReinstatableClubs (#3007, phase 3) — the district's reinstatable clubs
 * for the DISPLAYED snapshot (R3). Fixture: the staging 2026-11-18 file,
 * where D61 lists 22 clubs and D93 is a measured `[]`. `null` means "not
 * measured" and must never collapse into `[]`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReinstatableClubs } from '@taverns-red/shared-contracts'
import { useReinstatableClubs } from '../useReinstatableClubs'
import { fetchCdnReinstatableClubs } from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'
import recordedJson from '../../__tests__/fixtures/reinstatable-clubs-2026-11-18.recorded.json'

vi.mock('../../services/cdn', () => ({
  fetchCdnReinstatableClubs: vi.fn(),
}))
const mocked = vi.mocked(fetchCdnReinstatableClubs)
const recorded = recordedJson as unknown as ReinstatableClubs

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useReinstatableClubs', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('lists the recorded D61 clubs and the base year for the displayed date', async () => {
    mocked.mockResolvedValue(recorded)
    const { result } = renderHook(
      () => useReinstatableClubs('61', snap('2026-11-18')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.clubs).toHaveLength(22))
    expect(mocked).toHaveBeenCalledWith('2026-11-18')
    expect(result.current.baseProgramYear).toBe('2026-2027')
    expect(result.current.clubs?.[0]?.clubNumber).toBe('1849755')
  })

  it('keeps a measured zero as an empty list', async () => {
    mocked.mockResolvedValue(recorded)
    const { result } = renderHook(
      () => useReinstatableClubs('93', snap('2026-11-18')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clubs).toEqual([])
  })

  it('is null — not measured — when the date has no file', async () => {
    mocked.mockResolvedValue(null)
    const { result } = renderHook(
      () => useReinstatableClubs('61', snap('2026-11-17')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clubs).toBeNull()
    expect(result.current.baseProgramYear).toBeNull()
  })

  it('is null when the district is absent from the file', async () => {
    mocked.mockResolvedValue(recorded)
    const { result } = renderHook(
      () => useReinstatableClubs('999', snap('2026-11-18')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clubs).toBeNull()
  })

  it('never uses another date’s file', async () => {
    mocked.mockResolvedValue(recorded)
    const { result } = renderHook(
      () => useReinstatableClubs('61', snap('2026-11-19')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.clubs).toBeNull()
  })

  it('does not fetch without a date', () => {
    const { result } = renderHook(() => useReinstatableClubs('61', undefined), {
      wrapper,
    })
    expect(mocked).not.toHaveBeenCalled()
    expect(result.current.clubs).toBeNull()
  })
})
