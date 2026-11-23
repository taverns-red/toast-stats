/**
 * A suspended club's panels land once, with the reinstate window (#3108).
 *
 * "Time left to reinstate" sits between the hero and the stat strip. Its row
 * comes from the page date's reinstatable-clubs.json, a read that starts only
 * after analytics says the club is Suspended. The full render used to show as
 * soon as the suspended list landed, and the window panel arrived a moment
 * later and pushed the stat strip and trend grid down: CLS 0.42 at 375px on
 * /district/61/club/1849755 on the production build.
 *
 * The contract, like the suspended list's (#3108) and the history shard's
 * (#1805): the full render waits for the reinstatable list to settle, so the
 * window panel arrives in the same commit as the grids.
 *
 * R22: full-page mount, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import type {
  ReinstatableClubs,
  SuspendedClubs,
} from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import {
  fetchCdnReinstatableClubs,
  fetchCdnSuspendedClubs,
} from '../../services/cdn'

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

const DATE = '2026-11-19'

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({ data: { districts: [] } })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      districtId: '61',
      dates: ['2026-11-19'],
      count: 1,
      dateRange: { startDate: '2026-11-19', endDate: '2026-11-19' },
    },
    isPending: false,
    isError: false,
  })),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
  fetchCdnSuspendedClubs: vi.fn(),
  fetchCdnReinstatableClubs: vi.fn(),
  fetchCdnGlobalClubRace: vi.fn().mockResolvedValue(null),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-11-19'],
    count: 1,
    generatedAt: '2026-11-20T00:00:00Z',
  }),
  fetchCdnRankings: vi
    .fn()
    .mockResolvedValue({ rankings: [], asOfDate: '2026-11-19' }),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-11-19' }),
}))

vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
  ClubTrend: {},
}))

// The issue's club (prod 2026-11-21): suspended on Sep 30, 2026, period 1.
const heroRecord = {
  clubId: '1849755',
  clubName: 'Toastmasters At St. Lawrence College',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  clubStatus: 'Suspended',
}

const analyticsClub = {
  ...heroRecord,
  membershipTrend: [{ date: DATE, count: 4 }],
  dcpGoalsTrend: [{ date: DATE, goalsAchieved: 0 }],
  membershipBase: 8,
  currentStatus: 'intervention-required' as const,
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished' as const,
  octoberRenewals: 0,
  aprilRenewals: 0,
  newMembers: 0,
}

const suspendedFile: SuspendedClubs = {
  _format: { version: '1.0.0', type: 'suspended-clubs' },
  snapshotDate: DATE,
  programYear: { start: '2026-07-01', end: '2027-06-30' },
  districts: {
    '61': [
      {
        clubNumber: '1849755',
        clubName: 'Toastmasters At St. Lawrence College',
        division: 'A',
        area: '01',
        suspendDate: '2026-09-30',
      },
    ],
  },
}

const reinstatableFile: ReinstatableClubs = {
  _format: { version: '1.0.0', type: 'reinstatable-clubs' },
  snapshotDate: DATE,
  baseProgramYear: '2027-2028',
  districts: {
    '61': [
      {
        clubNumber: '1849755',
        clubName: 'Toastmasters At St. Lawrence College',
        division: 'A',
        area: '01',
        status: 'suspended',
        suspendDate: '2026-09-30',
        addsToBase: true,
        reason: 'suspended_sept30_october_cycle',
        inactivePeriod: 1,
        lastChanceBy: '2029-03-31',
      },
    ],
  },
}

const mockedAnalytics = vi.mocked(useDistrictAnalytics)
const mockedStats = vi.mocked(useDistrictStatistics)
const mockedSuspended = vi.mocked(fetchCdnSuspendedClubs)
const mockedReinstatable = vi.mocked(fetchCdnReinstatableClubs)

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  mockedSuspended.mockResolvedValue(suspendedFile)
  mockedStats.mockImplementation(
    () =>
      ({
        data: {
          districtId: '61',
          data: {
            districtId: '61',
            snapshotDate: DATE,
            clubs: [heroRecord],
            clubPerformance: [],
            divisionPerformance: [],
          },
        },
        isLoading: false,
      }) as never
  )
  mockedAnalytics.mockImplementation(((
    districtId: string | null,
    _start?: string,
    _end?: string,
    options?: { enabled?: boolean }
  ) => {
    const enabled = !!districtId && (options?.enabled ?? true)
    return enabled
      ? {
          data: { districtId, allClubs: [analyticsClub] },
          isLoading: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }
      : {
          data: undefined,
          isLoading: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }
  }) as never)
})

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route
                path="/district/:districtId/club/:clubId"
                element={<ClubDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('ClubDetailPage — suspended club reinstate window (#3108)', () => {
  it('shows no stat or trend grid until the reinstatable list settles, so the window never pushes them down', async () => {
    let resolveList: (v: ReinstatableClubs) => void = () => {}
    mockedReinstatable.mockReturnValue(
      new Promise(resolve => {
        resolveList = resolve
      })
    )

    renderAt('/district/61/club/1849755')
    await waitFor(() => expect(mockedReinstatable).toHaveBeenCalled())
    // The suspended list has resolved and the hero is up.
    await waitFor(() => expect(mockedSuspended).toHaveBeenCalled())
    await screen.findByText('Toastmasters At St. Lawrence College', {
      selector: 'h1',
    })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(document.querySelector('.club-stats-grid')).toBeNull()
    expect(document.querySelector('.club-trend-grid')).toBeNull()

    resolveList(reinstatableFile)

    await screen.findByTestId('club-reinstate-window')
    expect(document.querySelector('.club-stats-grid')).not.toBeNull()
    expect(document.querySelector('.club-trend-grid')).not.toBeNull()
  })

  it('renders the grids when the reinstatable list is missing', async () => {
    mockedReinstatable.mockResolvedValue(null)

    renderAt('/district/61/club/1849755')

    await waitFor(() =>
      expect(document.querySelector('.club-stats-grid')).not.toBeNull()
    )
    expect(screen.queryByTestId('club-reinstate-window')).toBeNull()
  })
})
