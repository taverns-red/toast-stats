/**
 * useClubHistory — cross-district history and per-year gap reasons (#1437).
 *
 * A club's history is keyed on its CLUB NUMBER, not on a district. The
 * 2026-07-01 Toastmasters district reformation merged and split districts and
 * moved clubs between them: a club is continuous across that move (same club
 * number, same charter), only its parent district changed.
 *
 * Two defects made that invisible:
 *
 *  1. candidate years were read from ONE district's snapshot-index entry
 *     (`index[districtId]`), so every completed year the club spent in another
 *     district was never even considered; and
 *  2. every unhappy path returned `null` and was filtered away, so "no snapshot
 *     for that year", "that collection failed" and "the club is not in this
 *     district's snapshot" all rendered as the same empty table (Lesson 47 —
 *     a lookup that degrades to nothing is indistinguishable from no data).
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

/** The operator's reported club, now in D70, previously elsewhere. */
const MOVED_CLUB = '00002274'

function club(overrides: Partial<ClubStatisticsFile> = {}): ClubStatisticsFile {
  return {
    clubId: MOVED_CLUB,
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

function snapshot(
  date: string,
  clubs: ClubStatisticsFile[],
  districtId = '70'
): PerDistrictData {
  const data: DistrictStatisticsFile = {
    districtId,
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
    districtId,
    districtName: `District ${districtId}`,
    collectedAt: `${date}T12:00:00.000Z`,
    status: 'success',
    data,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useClubHistory cross-district coverage (#1437)', () => {
  it('reports the completed years this district cannot cover instead of dropping them silently', async () => {
    // The club is in D70 now; it spent 2022-23 → 2024-25 in D90. D70's own
    // index entry only reaches back to the reformation year-end, so scoping
    // candidate years to `index['70']` loses three completed years outright.
    mockedIndex.mockResolvedValue({
      '70': ['2026-06-30'],
      '90': ['2023-06-30', '2024-06-30', '2025-06-30'],
    })
    mockedSnapshot.mockImplementation(async (date: string) => {
      if (date === '2026-06-30') return snapshot(date, [club()]) as never
      throw new Error(`unexpected fetch for ${date}`)
    })

    const { result } = renderHook(() => useClubHistory('70', MOVED_CLUB), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The one year D70 can serve still renders.
    expect(result.current.rows.map(r => r.startYear)).toEqual([2025])
    // The three years the club spent elsewhere are REPORTED, not invisible.
    expect(result.current.gaps.map(g => g.startYear)).toEqual([
      2024, 2023, 2022,
    ])
    expect(result.current.gaps.every(g => g.reason === 'district-absent')).toBe(
      true
    )
    expect(result.current.gaps[0]).toMatchObject({
      districtId: '70',
      label: '2024-2025',
      yearEndDate: null,
    })
    // Only the one district's own year-end was ever fetched — no fan-out.
    expect(mockedSnapshot).toHaveBeenCalledTimes(1)
    expect(mockedSnapshot).toHaveBeenCalledWith('2026-06-30', '70')
  })

  it('distinguishes club-absent, snapshot-unavailable and a failed collection', async () => {
    mockedIndex.mockResolvedValue({
      '70': ['2023-06-30', '2024-06-30', '2025-06-30', '2026-06-30'],
    })
    mockedSnapshot.mockImplementation(async (date: string) => {
      if (date === '2026-06-30') return snapshot(date, [club()]) as never
      if (date === '2025-06-30')
        return snapshot(date, [club({ clubId: '99999999' })]) as never
      if (date === '2024-06-30') throw new Error('404')
      return {
        districtId: '70',
        districtName: 'District 70',
        collectedAt: `${date}T12:00:00.000Z`,
        status: 'failed',
        errorMessage: 'scrape error',
      } as never
    })

    const { result } = renderHook(() => useClubHistory('70', MOVED_CLUB), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows.map(r => r.startYear)).toEqual([2025])
    expect(result.current.gaps.map(g => [g.startYear, g.reason])).toEqual([
      [2024, 'club-absent'],
      [2023, 'snapshot-unavailable'],
      [2022, 'snapshot-failed'],
    ])
  })

  it('matches a bare stored club id against a zero-padded URL param', async () => {
    mockedIndex.mockResolvedValue({ '70': ['2024-06-30'] })
    mockedSnapshot.mockImplementation(
      async (date: string) =>
        snapshot(date, [club({ clubId: '2274' })]) as never
    )

    const { result } = renderHook(() => useClubHistory('70', '00002274'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows.map(r => r.startYear)).toEqual([2023])
    expect(result.current.gaps).toEqual([])
  })

  it('matches a zero-padded stored club id against a bare URL param', async () => {
    mockedIndex.mockResolvedValue({ '70': ['2024-06-30'] })
    mockedSnapshot.mockImplementation(
      async (date: string) =>
        snapshot(date, [club({ clubId: '00002274' })]) as never
    )

    const { result } = renderHook(() => useClubHistory('70', '2274'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows.map(r => r.startYear)).toEqual([2023])
  })
})
