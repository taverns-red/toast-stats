/**
 * Unit tests for useClubHistory (#1229, epic #1228).
 *
 * Assembles a single club's per-program-year history from two EXISTING CDN
 * endpoints — the district snapshot index (available dates) and each completed
 * year's year-end district snapshot — with no new pipeline step. Picks the
 * latest in-PY date as that year's settled value (nearest-prior to Jun 30,
 * #621), and tolerates a club that is absent in a given year or a snapshot
 * that fails to load.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import type {
  ClubStatisticsFile,
  DistrictStatisticsFile,
  PerDistrictData,
} from '@taverns-red/shared-contracts'
import { useClubHistory } from '../useClubHistory'
import {
  fetchCdnSnapshotIndex,
  fetchCdnDistrictSnapshot,
} from '../../services/cdn'
import { getCurrentProgramYear } from '../../utils/programYear'

vi.mock('../../services/cdn', () => ({
  fetchCdnSnapshotIndex: vi.fn(),
  fetchCdnDistrictSnapshot: vi.fn(),
}))

const mockedIndex = vi.mocked(fetchCdnSnapshotIndex)
const mockedSnapshot = vi.mocked(fetchCdnDistrictSnapshot)

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const CLUB_ID = '00001234'

function club(overrides: Partial<ClubStatisticsFile> = {}): ClubStatisticsFile {
  return {
    clubId: CLUB_ID,
    clubName: 'Test Club',
    divisionId: 'A',
    areaId: '01',
    membershipCount: 30,
    paymentsCount: 38,
    dcpGoals: 6,
    status: 'Active',
    divisionName: 'Division A',
    areaName: 'Area 01',
    octoberRenewals: 17,
    aprilRenewals: 15,
    newMembers: 8,
    membershipBase: 22,
    clubStatus: 'Active',
    distinguishedStatus: 'D',
    ...overrides,
  }
}

// The dated CDN file is a PerDistrictData ENVELOPE — the parsed clubs live at
// `.data.clubs`, not the top level. The mock must mirror the wire shape or it
// hides the unwrap (the live file top-level is {districtId, …, status, data}).
function snapshot(date: string, clubs: ClubStatisticsFile[]): PerDistrictData {
  const data: DistrictStatisticsFile = {
    districtId: '61',
    snapshotDate: date,
    clubs,
    divisions: [],
    areas: [],
    totals: {} as DistrictStatisticsFile['totals'],
    divisionPerformance: [],
    clubPerformance: [],
    districtPerformance: [],
  }
  return {
    districtId: '61',
    districtName: 'District 61',
    collectedAt: `${date}T12:00:00.000Z`,
    status: 'success',
    data,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useClubHistory (#1229)', () => {
  it('returns one row per completed program year the club appears in, newest first', async () => {
    mockedIndex.mockResolvedValue({
      '61': ['2022-09-30', '2023-06-30', '2023-12-31', '2024-06-30'],
    })
    mockedSnapshot.mockImplementation(async (date: string) => {
      if (date === '2023-06-30')
        return snapshot(date, [club({ dcpGoals: 5 })]) as never
      if (date === '2024-06-30')
        return snapshot(date, [
          club({ dcpGoals: 9, distinguishedStatus: 'P' }),
        ]) as never
      throw new Error(`unexpected date ${date}`)
    })

    const { result } = renderHook(() => useClubHistory('61', CLUB_ID), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows.map(r => r.startYear)).toEqual([2023, 2022])
    expect(result.current.rows[0]).toMatchObject({
      startYear: 2023,
      yearEndDate: '2024-06-30',
      dcpGoals: 9,
      tierCode: 'P',
    })
    expect(result.current.rows[1]).toMatchObject({
      startYear: 2022,
      yearEndDate: '2023-06-30',
      dcpGoals: 5,
    })
    // clubName is taken from the most-recent year the club appears in.
    expect(result.current.clubName).toBe('Test Club')
  })

  it('uses the LATEST in-PY date as the year-end (nearest-prior to Jun 30)', async () => {
    mockedIndex.mockResolvedValue({
      '61': ['2023-06-15', '2023-06-28'], // both in PY 2022-23
    })
    mockedSnapshot.mockImplementation(
      async (date: string) => snapshot(date, [club()]) as never
    )

    const { result } = renderHook(() => useClubHistory('61', CLUB_ID), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0]!.yearEndDate).toBe('2023-06-28')
    expect(mockedSnapshot).toHaveBeenCalledWith('2023-06-28', '61')
    expect(mockedSnapshot).not.toHaveBeenCalledWith('2023-06-15', '61')
  })

  it('excludes the current, incomplete program year', async () => {
    const currentYearEnd = `${getCurrentProgramYear().year + 1}-06-30`
    // A snapshot dated inside the current (incomplete) program year.
    const currentInProgress = `${getCurrentProgramYear().year}-09-30`
    mockedIndex.mockResolvedValue({
      '61': ['2023-06-30', currentInProgress],
    })
    mockedSnapshot.mockImplementation(
      async (date: string) => snapshot(date, [club()]) as never
    )

    const { result } = renderHook(() => useClubHistory('61', CLUB_ID), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0]!.yearEndDate).toBe('2023-06-30')
    expect(mockedSnapshot).not.toHaveBeenCalledWith(currentInProgress, '61')
    // Belt-and-braces: the would-be current year-end was never fetched either.
    expect(mockedSnapshot).not.toHaveBeenCalledWith(currentYearEnd, '61')
  })

  it('skips a completed year in which the club is absent', async () => {
    mockedIndex.mockResolvedValue({
      '61': ['2023-06-30', '2024-06-30'],
    })
    mockedSnapshot.mockImplementation(async (date: string) => {
      if (date === '2023-06-30')
        return snapshot(date, [club({ clubId: '99999999' })]) as never // other club only
      return snapshot(date, [club()]) as never
    })

    const { result } = renderHook(() => useClubHistory('61', CLUB_ID), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows.map(r => r.startYear)).toEqual([2023])
  })

  it('tolerates a year-end snapshot that fails to load', async () => {
    mockedIndex.mockResolvedValue({
      '61': ['2023-06-30', '2024-06-30'],
    })
    mockedSnapshot.mockImplementation(async (date: string) => {
      if (date === '2023-06-30') throw new Error('404')
      return snapshot(date, [club()]) as never
    })

    const { result } = renderHook(() => useClubHistory('61', CLUB_ID), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isError).toBe(false)
    expect(result.current.rows.map(r => r.startYear)).toEqual([2023]) // 2024-06-30 = PY 2023-24
  })

  it('skips a year whose snapshot collection failed (no usable data)', async () => {
    mockedIndex.mockResolvedValue({ '61': ['2023-06-30', '2024-06-30'] })
    mockedSnapshot.mockImplementation(async (date: string) => {
      if (date === '2023-06-30') {
        return {
          districtId: '61',
          districtName: 'District 61',
          collectedAt: `${date}T12:00:00.000Z`,
          status: 'failed',
          errorMessage: 'scrape error',
        } as never
      }
      return snapshot(date, [club()]) as never
    })

    const { result } = renderHook(() => useClubHistory('61', CLUB_ID), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows.map(r => r.startYear)).toEqual([2023])
  })

  it('is idle (no fetch) when districtId or clubId is missing', async () => {
    const { result } = renderHook(() => useClubHistory(null, CLUB_ID), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows).toEqual([])
    expect(mockedIndex).not.toHaveBeenCalled()
  })

  it('returns an empty list when the district has no completed snapshots', async () => {
    mockedIndex.mockResolvedValue({ '61': [] })
    const { result } = renderHook(() => useClubHistory('61', CLUB_ID), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows).toEqual([])
  })
})
