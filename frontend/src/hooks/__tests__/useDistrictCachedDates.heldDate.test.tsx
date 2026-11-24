/**
 * useDistrictCachedDates with a held date (#3195).
 *
 * Every district page reads its default date from this one hook, so the cap at
 * `v1/latest.json` lives here: `dates` and `dateRange.endDate` stop at the
 * manifest, `allDates` keeps the held date for the picker and an explicit
 * `?date=`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { useDistrictCachedDates } from '../useDistrictData'
import { useDistrictProgramYearControls } from '../useDistrictProgramYearControls'

vi.mock('../../services/cdn', () => ({
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({
    '61': ['2026-11-20', '2026-11-21', '2026-11-22'],
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-11-21',
    generatedAt: '2026-11-23T00:00:00Z',
  }),
}))

afterEach(() => cleanup())

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={['/district/61']}>
          {children}
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('useDistrictCachedDates with a held date (#3195)', () => {
  it('stops dates and dateRange.endDate at the manifest date', async () => {
    const { result } = renderHook(() => useDistrictCachedDates('61'), {
      wrapper,
    })
    await waitFor(() =>
      expect(result.current.data?.dateRange?.endDate).toBe('2026-11-21')
    )
    expect(result.current.data?.dates).toEqual(['2026-11-20', '2026-11-21'])
    expect(result.current.data?.count).toBe(2)
  })

  it('keeps the held date in allDates for the picker and ?date=', async () => {
    const { result } = renderHook(() => useDistrictCachedDates('61'), {
      wrapper,
    })
    await waitFor(() =>
      expect(result.current.data?.dateRange?.endDate).toBe('2026-11-21')
    )
    expect(result.current.data?.allDates).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ])
  })

  it('agrees with the date the controls open on, so the header reads it as newest', async () => {
    const { result } = renderHook(
      () => ({
        dates: useDistrictCachedDates('61'),
        controls: useDistrictProgramYearControls('61'),
      }),
      { wrapper }
    )
    await waitFor(() =>
      expect(result.current.dates.data?.dateRange?.endDate).toBe('2026-11-21')
    )
    expect(result.current.controls.effectiveEndDate).toBe('2026-11-21')
    expect(result.current.controls.latestSnapshotDate).toBe(
      result.current.dates.data?.dateRange?.endDate
    )
    expect(result.current.controls.isLatestSnapshot).toBe(true)
  })
})
