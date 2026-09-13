import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { GlobalClubRace } from '@taverns-red/shared-contracts'
import { globalClubRaceQueryKey, useGlobalClubRace } from '../useGlobalClubRace'
import {
  fetchCdnGlobalClubRace,
  fetchLatestSnapshotDate,
} from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchCdnGlobalClubRace: vi.fn(),
  fetchLatestSnapshotDate: vi.fn(),
}))

/**
 * #1556 — one query for the whole `/clubs` area. A caller that has already
 * resolved a snapshot date pins the query to it (Lesson 59); otherwise the
 * hook resolves "latest" itself. Rows are also exposed as a Map by club id
 * so the club page's "worldwide standing" card is an O(1) lookup.
 */

const race = (overrides: Partial<GlobalClubRace> = {}): GlobalClubRace =>
  ({
    _format: { version: '1.0.0', type: 'global-club-race' },
    date: '2026-09-11',
    programYear: '2026-2027',
    generatedAt: '2026-09-11T10:00:00.000Z',
    scope: {
      districts: { total: 1, numbered: 1, includesUndistricted: false },
      clubsScanned: 2,
      excludedDistricts: [],
      missingDistricts: [],
      reachedAbsentToday: 0,
      officialWithoutDerived: 0,
    },
    ruleset: {
      programYear: '2026-2027',
      cspRequired: true,
      smedleyAvailable: true,
      membershipBasis: 'confirmed-renewals',
      officialRecognitionFrom: '2027-04-01',
      tiers: [],
    },
    observation: {
      firstObservedDate: '2026-09-11',
      previousSnapshotDate: null,
      observedDates: 1,
      resolution: 'unknown',
    },
    timeline: [],
    distribution: {
      goalsMet: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      membership: { lt12: 2, from12to19: 0, from20to24: 0, ge25: 0 },
      byTierRequirementsMet: {
        none: 2,
        Distinguished: 0,
        Select: 0,
        President: 0,
        Smedley: 0,
      },
      byOfficialCode: { none: 2, D: 0, S: 0, P: 0, M: 0 },
      cohorts: {
        lt12: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        from12to19: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        from20to24: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ge25: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    reached: [
      {
        clubId: '3045',
        clubName: 'Limestone City Club',
        districtId: '61',
        current: null,
        tiers: {
          Distinguished: {
            reachedOn: '2026-09-11',
            observedAfter: null,
            rank: 1,
          },
        },
        official: null,
      },
    ],
    byDistrict: [],
    ...overrides,
  }) as GlobalClubRace

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useGlobalClubRace (#1556)', () => {
  beforeEach(() => {
    vi.mocked(fetchCdnGlobalClubRace).mockReset()
    vi.mocked(fetchLatestSnapshotDate).mockReset()
  })

  it('pins the query to the date it is given and never resolves "latest"', async () => {
    vi.mocked(fetchCdnGlobalClubRace).mockResolvedValue(race())

    const { result } = renderHook(() => useGlobalClubRace(snap('2026-09-11')), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.race).not.toBeNull())
    expect(fetchLatestSnapshotDate).not.toHaveBeenCalled()
    expect(fetchCdnGlobalClubRace).toHaveBeenCalledWith('2026-09-11')
    expect(result.current.snapshotDate).toBe('2026-09-11')
  })

  it('resolves the latest snapshot date when none is given', async () => {
    vi.mocked(fetchLatestSnapshotDate).mockResolvedValue(snap('2026-09-12'))
    vi.mocked(fetchCdnGlobalClubRace).mockResolvedValue(
      race({ date: '2026-09-12' })
    )

    const { result } = renderHook(() => useGlobalClubRace(), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.race?.date).toBe('2026-09-12'))
    expect(fetchCdnGlobalClubRace).toHaveBeenCalledWith('2026-09-12')
    expect(result.current.snapshotDate).toBe('2026-09-12')
  })

  it('exposes reached rows as a Map by club id', async () => {
    vi.mocked(fetchCdnGlobalClubRace).mockResolvedValue(race())

    const { result } = renderHook(() => useGlobalClubRace(snap('2026-09-11')), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.race).not.toBeNull())
    expect(result.current.reachedById.get('3045')?.clubName).toBe(
      'Limestone City Club'
    )
    expect(result.current.reachedById.has('9')).toBe(false)
  })

  it('reports an absent artifact as race: null, not an error', async () => {
    vi.mocked(fetchCdnGlobalClubRace).mockResolvedValue(null)

    const { result } = renderHook(() => useGlobalClubRace(snap('2026-06-30')), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.race).toBeNull()
    expect(result.current.isError).toBe(false)
    expect(result.current.reachedById.size).toBe(0)
  })

  it('keys the cache on the date so subpages share one fetch', () => {
    expect(globalClubRaceQueryKey(snap('2026-09-11'))).toEqual([
      'global-club-race',
      '2026-09-11',
    ])
    expect(globalClubRaceQueryKey(undefined)).toEqual([
      'global-club-race',
      'latest',
    ])
  })
})
