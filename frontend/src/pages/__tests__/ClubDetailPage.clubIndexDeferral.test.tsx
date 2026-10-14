/**
 * Club-index deferral for ClubDetailPage (#1830, mobile epic #1827).
 *
 * `config/club-index.json` is ~975 KB on the wire. The page needs it ONLY for
 * the moved-club lookup (#1441), i.e. once this district's analytics has
 * settled WITHOUT the club. Before #1830 the lookup's `enabled` was true on the
 * first renders — while the district's dates were still loading, the analytics
 * query was disabled (`isLoading` false, no data), so `!club && !isLoading`
 * held and every cold club-page load paid the 975 KB fetch (10.5 s LCP on the
 * throttled mobile profile). These tests pin the fetch to the moved-club path.
 *
 * Original header (#1441):
 *
 * The 2026-07-01 district reformation moved clubs between districts. A club is
 * continuous across that move — same number, same charter — so every link made
 * before July points at the club's OLD district. The not-found branch used to
 * tell those visitors the club "may have been removed"; `config/club-index.json`
 * (the same index `ClubRedirectPage` consumes) knows exactly which district the
 * club is in now.
 *
 * R22: this is a full-page mount, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { fetchCdnClubIndex } from '../../services/cdn'

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
    data: {
      districts: [
        { id: '90', name: 'District 90' },
        { id: '70', name: 'District 70' },
      ],
    },
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      districtId: '90',
      dates: ['2026-08-01'],
      count: 1,
      dateRange: { startDate: '2026-08-01', endDate: '2026-08-01' },
    },
  })),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-08-01'],
    count: 1,
    generatedAt: '2026-08-02T00:00:00Z',
  }),
  fetchCdnRankings: vi
    .fn()
    .mockResolvedValue({ rankings: [], asOfDate: '2026-08-01' }),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-08-01' }),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: null, isLoading: false })),
}))

// The analytics hook mirrors the real one's disabled shape: called with a null
// district (dates not resolved yet) it is a DISABLED query — no data, and
// `isLoading` false (TanStack v5: isPending && isFetching). That shape is what
// let the club-index lookup fire on every cold load.
const presentClub = {
  clubId: '00002274',
  clubName: 'Riverside Toastmasters',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: 'A1',
  areaName: 'Area A1',
  membershipTrend: [{ date: '2026-08-01', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-08-01', goalsAchieved: 2 }],
  membershipBase: 20,
  currentStatus: 'thriving' as const,
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished' as const,
  octoberRenewals: 0,
  aprilRenewals: 0,
  newMembers: 0,
}
vi.mock('../../hooks/useClubAnalytics', () => ({
  useClubAnalytics: vi.fn((districtId: string | null) =>
    districtId
      ? {
          data: { districtId: '90', clubs: [presentClub] },
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
  ),
  ClubTrend: {},
}))

const mockedClubIndex = vi.mocked(fetchCdnClubIndex)
const mockedCachedDates = vi.mocked(useDistrictCachedDates)

const LocationProbe = () => {
  const { pathname } = useLocation()
  return <div data-testid="loc-path">{pathname}</div>
}

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

function renderAt(url = '/district/90/club/00002274') {
  // A fresh client per render — the club-index query key is shared app-wide,
  // so a module-level client would leak one test's index into the next.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <MemoryRouter initialEntries={[url]}>
            <LocationProbe />
            <Routes>
              <Route
                path="/district/:districtId/club/:clubId"
                element={<ClubDetailPage />}
              />
              <Route
                path="/district/:districtId"
                element={<div>district landing</div>}
              />
            </Routes>
          </MemoryRouter>
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

// Let any effect-scheduled fetch run before asserting a negative.
const settle = () => new Promise(resolve => setTimeout(resolve, 50))

describe('ClubDetailPage — club-index stays off the happy path (#1830)', () => {
  it('does not fetch the club index while the district dates are still loading', async () => {
    mockedCachedDates.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never)

    renderAt()
    await settle()

    expect(mockedClubIndex).not.toHaveBeenCalled()
  })

  it('does not fetch the club index when the club is in this district', async () => {
    mockedCachedDates.mockReturnValue({
      data: {
        districtId: '90',
        dates: ['2026-08-01'],
        count: 1,
        dateRange: { startDate: '2026-08-01', endDate: '2026-08-01' },
      },
      isPending: false,
      isError: false,
    } as never)

    renderAt()
    expect(
      await screen.findAllByText(/Riverside Toastmasters/)
    ).not.toHaveLength(0)
    await settle()

    expect(mockedClubIndex).not.toHaveBeenCalled()
  })

  it('still looks the club up when the district has no snapshot dates at all', async () => {
    mockedCachedDates.mockReturnValue({
      data: {
        districtId: '90',
        dates: [],
        count: 0,
        dateRange: null,
      },
      isPending: false,
      isError: false,
    } as never)
    mockedClubIndex.mockResolvedValue({
      clubs: {
        '00002274': { districtId: '70', clubName: 'Riverside Toastmasters' },
      },
    })

    renderAt()

    expect(await screen.findByText(/now in District 70/i)).toBeInTheDocument()
  })
})
