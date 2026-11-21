/**
 * A suspended club's hero chip lands once, with its date (#3108).
 *
 * The hero's club-status chip reads "Suspended since Sep 30, 2026". The date
 * comes from the page date's suspended-clubs.json, which is read only after
 * the club's analytics says the club is Suspended. The full render used to
 * show as soon as analytics landed, with a bare "Suspended" chip; the list
 * landed a moment later and the chip grew by the date. At 375px the longer
 * chip wrapped `.club-hero__pills` to a second row, and the stat strip and
 * trend grid below moved down 32px: CLS 0.134 on /district/61/club/1849755.
 *
 * The contract, like the lineage chip's (#1805): the full render waits for
 * the suspended list to settle, so the chip arrives in the same commit as
 * the panels (which replace the skeleton, not push painted content down).
 *
 * R22: full-page mount, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import type { SuspendedClubs } from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import { fetchCdnSuspendedClubs } from '../../services/cdn'

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
  fetchCdnReinstatableClubs: vi.fn().mockResolvedValue(null),
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

// The issue's club (prod 2026-11-19): suspended on Sep 30, 2026.
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

const mockedAnalytics = vi.mocked(useDistrictAnalytics)
const mockedStats = vi.mocked(useDistrictStatistics)
const mockedSuspended = vi.mocked(fetchCdnSuspendedClubs)

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
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

describe('ClubDetailPage — suspended club hero chip (#3108)', () => {
  it('holds the full render until the suspended list settles, so the chip never grows on screen', async () => {
    let resolveList: (v: SuspendedClubs) => void = () => {}
    mockedSuspended.mockReturnValue(
      new Promise(resolve => {
        resolveList = resolve
      })
    )

    renderAt('/district/61/club/1849755')
    await waitFor(() => expect(mockedSuspended).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 50))

    // Analytics has landed, but the page is still the hero-first render:
    // no status chip without its date.
    expect(screen.getByTestId('club-hero-pill-placeholder')).toBeInTheDocument()
    expect(
      document.querySelector('.club-hero [title="Club status"]')
    ).toBeNull()

    resolveList(suspendedFile)

    const chip = await screen.findByTitle('Club status')
    expect(chip).toHaveTextContent('Suspended since Sep 30, 2026')
    expect(screen.getByText('Intervention required')).toBeInTheDocument()
  })

  it('renders the page with a bare Suspended chip when the list has no entry', async () => {
    mockedSuspended.mockResolvedValue(null)

    renderAt('/district/61/club/1849755')

    const chip = await screen.findByTitle('Club status')
    expect(chip).toHaveTextContent(/^Suspended$/)
  })
})
