/* Club page "Worldwide standing" card (#1556, phase 4).
   Mounts ClubDetailPage with the district analytics and the race hook mocked
   (integration project). The card is present when the race artifact is on
   the CDN for the page's date and absent otherwise — never an error. */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import type { GlobalClubRace } from '@taverns-red/shared-contracts'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { useGlobalClubRace } from '../../hooks/useGlobalClubRace'

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  writable: true,
})

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({ data: { dates: ['2026-09-11'] } })),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
}))

// #2405 — the page's snapshot read lives in useMembershipData (the old
// `hooks/useDistrictStatistics` path does not exist, so that mock never
// applied and the snapshot went to the live CDN). Settled with no record.
vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: undefined, isLoading: false })),
}))

vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  // #2405 — ProgramYearProvider's default-PY read. Fixture, not the live CDN.
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-09-11'],
    count: 1,
    generatedAt: '2026-09-12T00:00:00Z',
  }),
  // #2405 — the club-history index, empty: these tests cover the worldwide
  // standing, not the year-end history, so no per-year snapshot is read.
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
}))

// #2405 — the club's district-history shard, settled as "not available":
// the reader resolves null on a 404 by contract.
vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../hooks/useGlobalClubRace', () => ({
  useGlobalClubRace: vi.fn(),
}))

const club = {
  clubId: '3045',
  clubName: 'Limestone City Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  membershipTrend: [{ date: '2026-09-11', count: 22 }],
  dcpGoalsTrend: [{ date: '2026-09-11', goalsAchieved: 5 }],
  currentStatus: 'thriving',
  healthScore: 80,
  membershipCount: 22,
  membershipBase: 20,
  paymentsCount: 40,
  riskFactors: [],
  distinguishedLevel: 'Distinguished',
  cspSubmitted: true,
  aprilRenewals: 22,
}

const hist = (...pairs: Array<[number, number]>): number[] => {
  const h = Array.from({ length: 11 }, () => 0)
  for (const [goals, n] of pairs) h[goals] = n
  return h
}

const RACE: GlobalClubRace = {
  _format: { version: '1.0.0', type: 'global-club-race' },
  date: '2026-09-11',
  programYear: '2026-2027',
  generatedAt: '2026-09-11T10:00:00.000Z',
  scope: {
    districts: { total: 1, numbered: 1, includesUndistricted: false },
    clubsScanned: 100,
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
    firstObservedDate: '2026-07-26',
    previousSnapshotDate: '2026-09-10',
    observedDates: 3,
    resolution: 'daily',
  },
  timeline: [],
  distribution: {
    goalsMet: hist([0, 50], [3, 30], [5, 15], [8, 5]),
    membership: { lt12: 40, from12to19: 30, from20to24: 20, ge25: 10 },
    byTierRequirementsMet: {
      none: 80,
      Distinguished: 15,
      Select: 5,
      President: 0,
      Smedley: 0,
    },
    byOfficialCode: { none: 100, D: 0, S: 0, P: 0, M: 0 },
    cohorts: {
      lt12: hist([0, 35], [3, 5]),
      from12to19: hist([0, 15], [3, 15]),
      from20to24: hist([3, 10], [5, 8], [8, 2]),
      ge25: hist([3, 0], [5, 7], [8, 3]),
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
          reachedOn: '2026-08-12',
          observedAfter: '2026-08-11',
          rank: 37,
        },
      },
      official: null,
    },
  ],
  byDistrict: [],
}

const mockRace = (race: GlobalClubRace | null) =>
  vi.mocked(useGlobalClubRace).mockReturnValue({
    race,
    snapshotDate: race?.date ?? null,
    reachedById: new Map(race ? race.reached.map(r => [r.clubId, r]) : []),
    isLoading: false,
    isError: false,
  })

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DarkModeProvider>
        <ProgramYearProvider>
          <MemoryRouter initialEntries={['/district/61/club/3045']}>
            <Routes>
              <Route
                path="/district/:districtId/club/:clubId"
                element={<ClubDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </ProgramYearProvider>
      </DarkModeProvider>
    </QueryClientProvider>
  )

describe('ClubDetailPage — Worldwide standing (#1556)', () => {
  beforeEach(() => {
    vi.mocked(useDistrictAnalytics).mockReturnValue({
      data: { allClubs: [club], districtId: '61' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDistrictAnalytics>)
    vi.mocked(useGlobalClubRace).mockReset()
  })

  it('shows the card with the cohort percentile and the reached rank when the race is available', async () => {
    mockRace(RACE)
    renderPage()
    const card = await screen.findByRole('region', {
      name: 'Worldwide standing',
    })
    expect(card).toHaveTextContent('Top 20% of clubs worldwide by goals met')
    expect(card).toHaveTextContent(
      '37th club in the world to reach Distinguished'
    )
    expect(card).toHaveTextContent('on 12 Aug')
  })

  // #1783 — §3.2 layout: the trend row is followed by the club's own panels
  // and callouts; worldwide standing closes the page after the DCP goals grid.
  it('places the card after the DCP Goals Progress panel (#1783 layout)', async () => {
    mockRace(RACE)
    renderPage()
    const card = await screen.findByRole('region', {
      name: 'Worldwide standing',
    })
    const dcpGoals = screen
      .getByText('DCP Goals Progress')
      .closest('.club-panel') as HTMLElement
    expect(dcpGoals.compareDocumentPosition(card)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })

  it('omits the card when the race artifact is not available for the date', async () => {
    mockRace(null)
    renderPage()
    // The club name appears in the hero and the breadcrumb; wait for any.
    await screen.findAllByText('Limestone City Club')
    expect(
      screen.queryByRole('region', { name: 'Worldwide standing' })
    ).toBeNull()
  })
})
