/**
 * usePriorYearClubGoals (#2432) — last year's DCP goals for every club in a
 * district, read from that district's own snapshot on the same date last
 * program year (or the nearest earlier one). One fetch, no new pipeline data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { PerDistrictData } from '@taverns-red/shared-contracts'
import { usePriorYearClubGoals } from '../usePriorYearClubGoals'
import { fetchCdnDistrictSnapshot } from '../../services/cdn'
import { snapshotDatesFrom } from '../../types/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnDistrictSnapshot: vi.fn(),
}))

const mockedSnapshot = vi.mocked(fetchCdnDistrictSnapshot)

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const dates = (...d: string[]) => snapshotDatesFrom({ dates: d })

function envelope(
  clubs: Array<{ clubId: string; dcpGoals: number }>
): PerDistrictData {
  return {
    districtId: '61',
    districtName: 'District 61',
    collectedAt: '2025-10-31T12:00:00Z',
    status: 'success',
    data: {
      districtId: '61',
      snapshotDate: '2025-10-31',
      clubs: clubs.map(c => ({
        clubId: c.clubId,
        clubName: `Club ${c.clubId}`,
        divisionId: 'A',
        areaId: '01',
        membershipCount: 20,
        paymentsCount: 20,
        dcpGoals: c.dcpGoals,
        status: 'Active',
        divisionName: 'Division A',
        areaName: 'Area 01',
      })),
    },
  } as unknown as PerDistrictData
}

describe('usePriorYearClubGoals (#2432)', () => {
  beforeEach(() => {
    mockedSnapshot.mockReset()
  })

  it('fetches the district snapshot for the nearest earlier prior-year date', async () => {
    mockedSnapshot.mockResolvedValue(
      envelope([
        { clubId: '1', dcpGoals: 3 },
        { clubId: '00002274', dcpGoals: 1 },
      ])
    )
    const all = dates('2025-10-02', '2025-10-28', '2025-11-03', '2026-10-31')
    const { result } = renderHook(
      () => usePriorYearClubGoals('61', all[3], all, true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(mockedSnapshot).toHaveBeenCalledTimes(1)
    expect(mockedSnapshot).toHaveBeenCalledWith('2025-10-28', '61')
    expect(result.current.data).toEqual({
      targetDate: '2025-10-31',
      comparisonDate: '2025-10-28',
      clubs: [
        { clubId: '1', dcpGoals: 3 },
        { clubId: '00002274', dcpGoals: 1 },
      ],
    })
  })

  it('returns no clubs and makes no request when the district has no prior-year snapshot', async () => {
    const all = dates('2026-06-30', '2026-10-31')
    const { result } = renderHook(
      () => usePriorYearClubGoals('205', all[1], all, true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({
      targetDate: '2025-10-31',
      comparisonDate: null,
      clubs: null,
    })
    expect(mockedSnapshot).not.toHaveBeenCalled()
  })

  it('makes no request while disabled (the preset is off)', () => {
    const all = dates('2025-10-31', '2026-10-31')
    const { result } = renderHook(
      () => usePriorYearClubGoals('61', all[1], all, false),
      { wrapper }
    )
    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(mockedSnapshot).not.toHaveBeenCalled()
  })

  it('reports an error when the snapshot fails to load, never empty data', async () => {
    mockedSnapshot.mockRejectedValue(new Error('404'))
    const all = dates('2025-10-31', '2026-10-31')
    const { result } = renderHook(
      () => usePriorYearClubGoals('61', all[1], all, true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
