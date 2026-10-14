/**
 * useClubAnalytics (#1901): the club page reads its club's shard, not the
 * whole district analytics file.
 *
 * The shard (`snapshots/<date>/analytics/district_<id>_clubs_<D>.json`) holds
 * the clubs whose id ends in D, as the analytics file's own `ClubTrend`s. The
 * hook reads it and the reports sidecar in parallel, and applies the same
 * read-time overlays the district hook does. A missing or malformed shard
 * (a date written before the shards existed) falls back to the district file,
 * so "club not in shard" never stands in for "club not in district".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import { useClubAnalytics } from '../useClubAnalytics'
import type { ClubTrend, DistrictAnalytics } from '../useDistrictAnalytics'
import {
  fetchFromCdn,
  fetchCdnDistrictReports,
  fetchCdnDistrictClubShard,
} from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchLatestSnapshotDate: vi.fn(),
  cdnAnalyticsUrl: vi.fn(() => 'https://cdn.test/analytics.json'),
  fetchFromCdn: vi.fn(),
  fetchCdnDistrictReports: vi.fn(),
  fetchCdnDistrictClubShard: vi.fn(),
}))

const mockedFull = vi.mocked(fetchFromCdn)
const mockedReports = vi.mocked(fetchCdnDistrictReports)
const mockedShard = vi.mocked(fetchCdnDistrictClubShard)

const trend = (clubId: string, clubStatus = 'Active'): ClubTrend =>
  ({
    clubId,
    clubName: `Club ${clubId}`,
    divisionId: 'C',
    divisionName: 'Division C',
    areaId: '23',
    areaName: 'Area 23',
    membershipTrend: [{ date: '2026-10-12', count: 10 }],
    dcpGoalsTrend: [{ date: '2026-10-12', goalsAchieved: 2 }],
    currentStatus: 'vulnerable',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    clubStatus,
  }) as ClubTrend

const shard = (clubs: ClubTrend[]) => ({
  _format: { version: '1.0.0', type: 'district-club-shard' as const },
  snapshotDate: '2026-10-12',
  districtId: '61',
  shard: '7' as const,
  shardCount: 10 as const,
  clubs,
})

const fullFile = (clubs: ClubTrend[]) => ({
  data: {
    districtId: '61',
    allClubs: clubs,
    vulnerableClubs: [],
    thrivingClubs: [],
    interventionRequiredClubs: [],
  } as unknown as DistrictAnalytics,
})

// A coach row for club 7238597 (#1954 shape).
const reports: DistrictReportsDataset = {
  districtId: '61',
  programYear: '2026-2027',
  generatedAt: '2026-10-12T00:00:00Z',
  sections: {
    coaches: {
      sources: [
        { reportType: 'coaches', tableId: 'x', asOf: 'October 12, 2026' },
      ],
      records: [
        {
          club: '7238597',
          clubName: '90 Elgin Toastmasters',
          code: 'CC',
          beginDate: '09/01/2026',
          status: 'PENDING',
          activeCoach: true,
        },
      ],
    },
  },
} as unknown as DistrictReportsDataset

let client: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

describe('useClubAnalytics (#1901)', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockedReports.mockResolvedValue(null)
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("reads the club's shard and the reports sidecar, never the district file", async () => {
    mockedShard.mockResolvedValue(shard([trend('7238597'), trend('3047')]))
    const { result } = renderHook(
      () => useClubAnalytics('61', '7238597', '2026-07-01', snap('2026-10-12')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedShard).toHaveBeenCalledWith('2026-10-12', '61', '7')
    expect(mockedReports).toHaveBeenCalledWith('2026-10-12', '61')
    expect(mockedFull).not.toHaveBeenCalled()
    expect(result.current.data?.club?.clubName).toBe('Club 7238597')
    expect(result.current.data?.source).toBe('shard')
  })

  it('finds a padded URL id in the shard of its canonical form', async () => {
    mockedShard.mockResolvedValue(shard([trend('3047')]))
    const { result } = renderHook(
      () =>
        useClubAnalytics('61', '00003047', '2026-07-01', snap('2026-10-12')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedShard).toHaveBeenCalledWith('2026-10-12', '61', '7')
    expect(result.current.data?.club?.clubId).toBe('3047')
  })

  it('reports a club absent from a built shard as absent (null), without the district file', async () => {
    mockedShard.mockResolvedValue(shard([trend('3047')]))
    const { result } = renderHook(
      () => useClubAnalytics('61', '7238597', '2026-07-01', snap('2026-10-12')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.club).toBeNull()
    expect(mockedFull).not.toHaveBeenCalled()
  })

  it('falls back to the district file when the date has no shard', async () => {
    mockedShard.mockResolvedValue(null)
    mockedFull.mockResolvedValue(fullFile([trend('7238597')]))
    const { result } = renderHook(
      () => useClubAnalytics('61', '7238597', '2026-07-01', snap('2026-10-12')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedFull).toHaveBeenCalledTimes(1)
    expect(result.current.data?.club?.clubName).toBe('Club 7238597')
    expect(result.current.data?.source).toBe('district')
  })

  it('reuses a district file already in the cache (navigating in from the district pages)', async () => {
    client.setQueryData(
      ['districtAnalytics', '61', '2026-07-01', '2026-10-12'],
      { ...fullFile([trend('7238597')]).data, districtReports: reports }
    )
    const { result } = renderHook(
      () => useClubAnalytics('61', '7238597', '2026-07-01', snap('2026-10-12')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedShard).not.toHaveBeenCalled()
    expect(mockedFull).not.toHaveBeenCalled()
    expect(result.current.data?.districtReports).toBe(reports)
    expect(result.current.data?.source).toBe('district')
  })

  it('applies the reports overlays to the shard club (coach, #1954)', async () => {
    mockedShard.mockResolvedValue(shard([trend('7238597')]))
    mockedReports.mockResolvedValue(reports)
    const { result } = renderHook(
      () => useClubAnalytics('61', '7238597', '2026-07-01', snap('2026-10-12')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.districtReports).toBe(reports)
    expect(result.current.data?.club?.coach).toBeDefined()
  })

  it('does not fetch while disabled', () => {
    renderHook(
      () =>
        useClubAnalytics('61', '7238597', '2026-07-01', snap('2026-10-12'), {
          enabled: false,
        }),
      { wrapper }
    )
    expect(mockedShard).not.toHaveBeenCalled()
    expect(mockedFull).not.toHaveBeenCalled()
  })
})
