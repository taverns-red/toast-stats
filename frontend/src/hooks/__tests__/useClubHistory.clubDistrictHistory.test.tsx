/**
 * useClubHistory resolves each program year's district from the
 * club-district history (#1803, epic #1781; artifact #1782).
 *
 * Before: one district's year-end snapshots, so `/district/201/club/977/
 * history` showed every pre-2026 year as `district-absent`. Now each
 * completed PY reads `byProgramYear` from the club's one history shard
 * (~12 KB, the #1843 reader) and fetches THAT district's year-end snapshot:
 * still one fetch per year, no fan-out. Rows carry their district; a PY
 * split between two spans whose year-end lacks the club is `moved-mid-year`.
 * Without the history (shard missing, club not listed) the hook behaves as
 * before (see useClubHistory.crossDistrict).
 *
 * Fixture: recorded prod shard 77 (asOf 2026-10-14): club 977 D01 → D201,
 * club 177 D34 until 2018-06-30, then D113.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import type {
  ClubDistrictHistoryShard,
  ClubStatisticsFile,
  DistrictStatisticsFile,
  PerDistrictData,
} from '@taverns-red/shared-contracts'
import { useClubHistory } from '../useClubHistory'
import {
  fetchCdnSnapshotIndex,
  fetchCdnDistrictSnapshot,
} from '../../services/cdn'
import { fetchClubDistrictHistoryShard } from '../../services/cdnClubDistrictHistory'
import shard77 from '../../__tests__/fixtures/club-district-history-77-2026-10-14.recorded.json'

vi.mock('../../services/cdn', () => ({
  fetchCdnSnapshotIndex: vi.fn(),
  fetchCdnDistrictSnapshot: vi.fn(),
}))
vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn(),
}))

const mockedIndex = vi.mocked(fetchCdnSnapshotIndex)
const mockedSnapshot = vi.mocked(fetchCdnDistrictSnapshot)
const mockedShard = vi.mocked(fetchClubDistrictHistoryShard)

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function club(clubId: string): ClubStatisticsFile {
  return {
    clubId,
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
  }
}

/** The dated file is a PerDistrictData envelope (Lesson: mock the wrapper). */
function snapshot(
  date: string,
  districtId: string,
  clubs: ClubStatisticsFile[]
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
  mockedShard.mockResolvedValue(shard77 as ClubDistrictHistoryShard)
  // The day the recorded shard is from: 2026-27 is in progress.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe("useClubHistory — each year's district from the history (#1803)", () => {
  it("fetches each completed year from that year's district, rows carrying it", async () => {
    // Club 177: D34 for 2016-17 and 2017-18, D113 from 2018-19.
    mockedIndex.mockResolvedValue({
      '34': ['2017-06-30', '2018-06-30'],
      '113': ['2019-06-30', '2020-06-30'],
    })
    mockedSnapshot.mockImplementation(
      async (date, districtId) =>
        snapshot(date, districtId, [club('177')]) as never
    )

    const { result } = renderHook(() => useClubHistory('113', '177'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows.map(r => [r.startYear, r.districtId])).toEqual([
      [2019, '113'],
      [2018, '113'],
      [2017, '34'],
      [2016, '34'],
    ])
    expect(result.current.gaps).toEqual([])
    expect(mockedSnapshot.mock.calls.map(c => [c[0], c[1]])).toEqual(
      expect.arrayContaining([
        ['2017-06-30', '34'],
        ['2018-06-30', '34'],
        ['2019-06-30', '113'],
        ['2020-06-30', '113'],
      ])
    )
    expect(mockedSnapshot).toHaveBeenCalledTimes(4)
    expect(mockedShard).toHaveBeenCalledWith('77')
  })

  it("reads a moved club's pre-move years from the district it was in (977 on D201)", async () => {
    mockedIndex.mockResolvedValue({
      '01': ['2024-06-30', '2025-06-30', '2026-06-30', '2026-07-30'],
      '201': ['2026-06-30', '2026-07-26', '2026-10-14'],
    })
    mockedSnapshot.mockImplementation(
      async (date, districtId) =>
        snapshot(date, districtId, [club('977')]) as never
    )

    const { result } = renderHook(() => useClubHistory('201', '977'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // 2025-26 is D01's year in the history, even though D201 has a
    // 2026-06-30 date of its own. 2026-27, in progress, is D201's: the
    // move shows (Ron, 2026-10-15).
    expect(
      result.current.rows.map(r => [r.startYear, r.districtId, r.yearEndDate])
    ).toEqual([
      [2026, '201', '2026-10-14'],
      [2025, '01', '2026-06-30'],
      [2024, '01', '2025-06-30'],
      [2023, '01', '2024-06-30'],
    ])
    expect(result.current.gaps).toEqual([])
    expect(mockedSnapshot).not.toHaveBeenCalledWith('2026-06-30', '201')
  })

  it('marks only the current year in progress, and reports no gap for it', async () => {
    mockedIndex.mockResolvedValue({
      '01': ['2026-06-30'],
      '201': ['2026-10-14'],
    })
    mockedSnapshot.mockImplementation(
      async (date, districtId) =>
        snapshot(
          date,
          districtId,
          date === '2026-10-14' ? [] : [club('977')]
        ) as never
    )

    const { result } = renderHook(() => useClubHistory('201', '977'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The club is not in the year so far: no row, and not a gap — the year
    // has not closed.
    expect(
      result.current.rows.map(r => [r.startYear, r.inProgress ?? false])
    ).toEqual([[2025, false]])
    expect(result.current.gaps).toEqual([])
  })

  it("reports a gap in that year's district, not the page's", async () => {
    mockedIndex.mockResolvedValue({
      '01': ['2025-06-30'],
      '201': ['2026-10-14'],
    })
    mockedSnapshot.mockImplementation(
      async (date, districtId) => snapshot(date, districtId, []) as never
    )

    const { result } = renderHook(() => useClubHistory('201', '977'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.gaps).toEqual([
      expect.objectContaining({
        startYear: 2024,
        districtId: '01',
        reason: 'club-absent',
      }),
    ])
  })

  it('calls a year split between two spans, absent at year-end, moved-mid-year', async () => {
    const split: ClubDistrictHistoryShard = {
      ...(shard77 as ClubDistrictHistoryShard),
      clubs: {
        '977': {
          ...(shard77.clubs[
            '977'
          ] as ClubDistrictHistoryShard['clubs'][string]),
          // Left D01 in March 2025; first seen in D201 in May 2025.
          spans: [
            { from: '2017-01-31', to: '2025-03-31', districtId: '01' },
            { from: '2025-05-31', to: null, districtId: '201' },
          ],
          byProgramYear: { '2024-2025': '201' },
        },
      },
    }
    mockedShard.mockResolvedValue(split)
    mockedIndex.mockResolvedValue({ '201': ['2025-06-30'] })
    mockedSnapshot.mockImplementation(
      async (date, districtId) => snapshot(date, districtId, []) as never
    )

    const { result } = renderHook(() => useClubHistory('201', '977'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.gaps.map(g => [g.startYear, g.reason])).toEqual([
      [2024, 'moved-mid-year'],
    ])
  })

  it('keeps the district-scoped behaviour when the history is unavailable', async () => {
    mockedShard.mockResolvedValue(null)
    mockedIndex.mockResolvedValue({
      '01': ['2025-06-30'],
      '201': ['2026-10-14'],
    })
    mockedSnapshot.mockImplementation(
      async (date, districtId) =>
        snapshot(date, districtId, [club('977')]) as never
    )

    const { result } = renderHook(() => useClubHistory('201', '977'), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows).toEqual([])
    expect(result.current.gaps).toEqual([
      expect.objectContaining({
        startYear: 2024,
        districtId: '201',
        reason: 'district-absent',
      }),
    ])
  })
})
