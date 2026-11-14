import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSnapshotDiff } from '../useSnapshotDiff'
import {
  fetchCdnDistrictSnapshot,
  fetchCdnRevisionDistrictSnapshot,
} from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'
import type { PerDistrictData } from '@taverns-red/shared-contracts'

vi.mock('../../services/cdn', () => ({
  fetchCdnDistrictSnapshot: vi.fn(),
  fetchCdnRevisionDistrictSnapshot: vi.fn(),
}))
const mockedDated = vi.mocked(fetchCdnDistrictSnapshot)
const mockedRevision = vi.mocked(fetchCdnRevisionDistrictSnapshot)

/* #2475 — the diff engine is unchanged: it takes two PerDistrictData. Only the
   address of each side changes: a revision point reads
   snapshots/<monthEnd>/revisions/<asOf>/, a plain date reads snapshots/<date>/. */

function wrapperData(members: number): PerDistrictData {
  return {
    districtId: '61',
    districtName: 'District 61',
    collectedAt: '2026-11-02T00:00:00Z',
    status: 'success',
    data: {
      districtId: '61',
      snapshotDate: '2026-10-31',
      clubs: [
        {
          clubId: '001',
          clubName: 'Club 001',
          divisionId: 'A',
          areaId: '01',
          membershipCount: members,
          paymentsCount: members,
          dcpGoals: 0,
          status: 'Active',
          divisionName: 'Division A',
          areaName: 'Area 01',
          octoberRenewals: 0,
          aprilRenewals: 0,
          newMembers: 0,
          membershipBase: members,
          clubStatus: 'Active',
        },
      ],
      divisions: [],
      areas: [],
      totals: {
        totalClubs: 1,
        totalMembership: members,
        totalPayments: members,
        distinguishedClubs: 0,
        selectDistinguishedClubs: 0,
        presidentDistinguishedClubs: 0,
      },
      divisionPerformance: [],
      clubPerformance: [
        { 'Club Number': '001', 'Club Distinguished Status': '' },
      ],
      districtPerformance: [],
    },
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useSnapshotDiff — revision points (#2475)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads a revision point from its revision file and a plain date from its snapshot', async () => {
    mockedRevision.mockResolvedValue(wrapperData(20) as never)
    mockedDated.mockResolvedValue(wrapperData(27) as never)
    const { result } = renderHook(
      () =>
        useSnapshotDiff(
          '61',
          { date: snap('2026-10-31'), asOf: '2026-11-02' },
          snap('2026-10-31')
        ),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedRevision).toHaveBeenCalledWith(
      '2026-10-31',
      '2026-11-02',
      '61'
    )
    expect(mockedDated).toHaveBeenCalledWith('2026-10-31', '61')
    expect(result.current.data?.totals.membership.delta).toBe(7)
  })

  it('caches two revisions of one month end separately', async () => {
    mockedRevision.mockResolvedValue(wrapperData(20) as never)
    mockedDated.mockResolvedValue(wrapperData(20) as never)
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const point = (asOf: string) => ({ date: snap('2026-10-31'), asOf })
    const a = renderHook(
      () => useSnapshotDiff('61', point('2026-11-02'), snap('2026-10-31')),
      { wrapper: shared }
    )
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true))
    const b = renderHook(
      () => useSnapshotDiff('61', point('2026-11-03'), snap('2026-10-31')),
      { wrapper: shared }
    )
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true))
    expect(mockedRevision).toHaveBeenCalledWith(
      '2026-10-31',
      '2026-11-03',
      '61'
    )
  })
})
