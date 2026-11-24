/**
 * useDistrictProgramYearControls with a held date (#3195).
 *
 * The pipeline holds a date's report sidecars when a read fails, and
 * `v1/latest.json` stays on the previous date (#3183). The per-district index
 * already lists the held date, so the default "latest" date must not run ahead
 * of the manifest. An explicit `?date=` still opens the held date.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { useDistrictProgramYearControls } from '../useDistrictProgramYearControls'

// Index newest is 2026-11-22; the manifest (reports in prod) is 2026-11-21.
vi.mock('../../services/cdn', () => ({
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({
    '61': ['2026-11-20', '2026-11-21', '2026-11-22'],
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-11-21',
    generatedAt: '2026-11-23T00:00:00Z',
  }),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-11-20', '2026-11-21', '2026-11-22'],
    count: 3,
    generatedAt: '2026-11-23T00:00:00Z',
  }),
}))

afterEach(() => cleanup())
beforeEach(() => {
  localStorage.clear()
})

const wrapperFor = (url: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProgramYearProvider>
          <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
        </ProgramYearProvider>
      </QueryClientProvider>
    )
  }
}

describe('useDistrictProgramYearControls with a held date (#3195)', () => {
  it('defaults to the manifest date when the district index runs ahead of it', async () => {
    const { result } = renderHook(() => useDistrictProgramYearControls('61'), {
      wrapper: wrapperFor('/district/61'),
    })
    await waitFor(() =>
      expect(result.current.effectiveEndDate).toBe('2026-11-21')
    )
    expect(result.current.isLatestSnapshot).toBe(true)
  })

  it('still lists the held date so it can be picked', async () => {
    const { result } = renderHook(() => useDistrictProgramYearControls('61'), {
      wrapper: wrapperFor('/district/61'),
    })
    await waitFor(() => expect(result.current.hasValidDates).toBe(true))
    expect([...result.current.availableDates].sort()).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ])
  })

  it('names the manifest date, not the held one, when ?date= has no snapshot', async () => {
    const { result } = renderHook(() => useDistrictProgramYearControls('61'), {
      wrapper: wrapperFor('/district/61?date=2026-11-23'),
    })
    await waitFor(() =>
      expect(result.current.effectiveEndDate).toBe('2026-11-21')
    )
  })

  it('opens an explicit ?date= for the held date as asked', async () => {
    const { result } = renderHook(() => useDistrictProgramYearControls('61'), {
      wrapper: wrapperFor('/district/61?date=2026-11-22'),
    })
    await waitFor(() => expect(result.current.hasValidDates).toBe(true))
    expect(result.current.effectiveEndDate).toBe('2026-11-22')
    await waitFor(() => expect(result.current.isLatestSnapshot).toBe(false))
    expect(result.current.effectiveEndDate).toBe('2026-11-22')
  })
})
