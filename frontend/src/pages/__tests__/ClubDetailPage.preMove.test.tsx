/**
 * Club page for a program year the club spent in ANOTHER district (#1804,
 * feature design §4.3).
 *
 * `/district/201/club/977?py=2024`: club 977 was in District 01 that year
 * (the club-district history, #1782). The page must not redirect (that loops
 * with the PY selector); it renders District 01's data for 2024-25 under a
 * banner, and the breadcrumb keeps following the URL. The converse — an old
 * District 01 link for the current year — says when the club moved.
 *
 * Load contract: the history shard (~12 KB) is read before the hero only on
 * these paths, where the URL district cannot answer (its dates lack an
 * explicit `?py=`, or its data lacks the club); a normal visit reads nothing
 * new before paint.
 *
 * R22: this is a full-page mount, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import type { ClubDistrictHistoryShard } from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { fetchCdnClubIndex } from '../../services/cdn'
import { fetchClubDistrictHistoryShard } from '../../services/cdnClubDistrictHistory'
import shard77 from '../../__tests__/fixtures/club-district-history-77-2026-10-14.recorded.json'
import snapshotIndex from '../../__tests__/fixtures/district-snapshot-index-01-201-2026-10-17.recorded.json'

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
        { id: '01', name: '01' },
        { id: '201', name: '201' },
      ],
    },
  })),
}))

// Per-district snapshot dates, recorded from config/district-snapshot-index
// on prod (#2079): D01 runs to 2026-07-30; D201 begins with a 2026-06-30
// file (the June close, collected in July under the new structure) and
// then the 2026 reformation's dates.
const DISTRICT_DATES: Record<string, string[]> = snapshotIndex.districts
vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn((districtId: string) => {
    const dates = DISTRICT_DATES[districtId] ?? []
    return {
      data: {
        districtId,
        dates,
        count: dates.length,
        dateRange: { startDate: dates[0], endDate: dates[dates.length - 1] },
      },
      isPending: false,
      isError: false,
    }
  }),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
  fetchCdnSuspendedClubs: vi.fn(),
  fetchCdnGlobalClubRace: vi.fn().mockResolvedValue(null),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2024-10-31', '2025-06-30', '2026-07-26', '2026-10-14'],
    count: 4,
    generatedAt: '2026-10-15T00:00:00Z',
  }),
  fetchCdnRankings: vi
    .fn()
    .mockResolvedValue({ rankings: [], asOfDate: '2026-10-14' }),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-14' }),
}))

vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn(),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: null, isLoading: false })),
}))

const club977 = {
  clubId: '977',
  clubName: 'Professional Women Toastmasters',
  divisionId: 'C',
  divisionName: 'Division C',
  areaId: '24',
  areaName: 'Area 24',
  membershipTrend: [{ date: '2025-06-30', count: 13 }],
  dcpGoalsTrend: [{ date: '2025-06-30', goalsAchieved: 1 }],
  membershipBase: 13,
  currentStatus: 'thriving' as const,
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished' as const,
  octoberRenewals: 0,
  aprilRenewals: 0,
  newMembers: 0,
  clubStatus: 'Active',
}

// Which districts' analytics list club 977, by the PY start date asked for.
let analyticsHas: (districtId: string, start?: string) => boolean
vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(
    (
      districtId: string | null,
      start?: string,
      _end?: string,
      options?: { enabled?: boolean }
    ) => {
      const enabled = !!districtId && (options?.enabled ?? true)
      if (!enabled)
        return {
          data: undefined,
          isLoading: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }
      return {
        data: {
          districtId,
          allClubs: analyticsHas(districtId!, start) ? [club977] : [],
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      }
    }
  ),
  ClubTrend: {},
}))

const mockedAnalytics = vi.mocked(useDistrictAnalytics)
const mockedShard = vi.mocked(fetchClubDistrictHistoryShard)
const mockedIndex = vi.mocked(fetchCdnClubIndex)

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  // The truth on prod: D01 through 2025-26, D201 from 2026-27, and D201's
  // 2026-06-30 file (PY 2025-26) lists the club too (#2079).
  analyticsHas = (d, start) =>
    d === '01' ? (start ?? '') < '2026-07-01' : d === '201'
  mockedShard.mockResolvedValue(shard77 as ClubDistrictHistoryShard)
  mockedIndex.mockResolvedValue({
    clubs: { '977': { districtId: '201', clubName: club977.clubName } },
  })
})

function Probe() {
  const loc = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <div data-testid="loc">{loc.pathname + loc.search}</div>
      <button type="button" onClick={() => navigate('?py=2026')}>
        pick 2026-27
      </button>
    </>
  )
}

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
                element={
                  <>
                    <ClubDetailPage />
                    <Probe />
                  </>
                }
              />
            </Routes>
          </MemoryRouter>
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const analyticsDistricts = () =>
  mockedAnalytics.mock.calls
    .filter(c => (c[3] as { enabled?: boolean } | undefined)?.enabled !== false)
    .map(c => c[0])
    .filter(Boolean)

describe('ClubDetailPage — a PY spent in another district (#1804)', () => {
  it("renders that year's district's data under a banner, without redirecting", async () => {
    renderAt('/district/201/club/977?py=2024')

    expect(
      await screen.findByText('In 2024–25 this club was in District 1.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Showing its District 1 figures for 2024–25.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open as District 1' })
    ).toHaveAttribute('href', '/district/01/club/977?py=2024')
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Professional Women Toastmasters',
      })
    ).toBeInTheDocument()
    expect(analyticsDistricts()).toContain('01')
    // No redirect: the URL is the one the visitor followed.
    expect(screen.getByTestId('loc')).toHaveTextContent(
      '/district/201/club/977?py=2024'
    )
    expect(mockedIndex).not.toHaveBeenCalled()
  })

  it('returns to the URL district when the PY selector moves to a year the club spent there', async () => {
    renderAt('/district/201/club/977?py=2024')
    await screen.findByText('In 2024–25 this club was in District 1.')

    await userEvent.click(screen.getByRole('button', { name: 'pick 2026-27' }))

    await waitFor(() =>
      expect(
        screen.queryByText(/this club was in District 1/)
      ).not.toBeInTheDocument()
    )
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(analyticsDistricts().at(-1)).toBe('201')
    expect(screen.getByTestId('loc')).toHaveTextContent(
      '/district/201/club/977?py=2026'
    )
  })

  it('says when the club moved, on an old link to the district it left', async () => {
    renderAt('/district/01/club/977')

    expect(
      await screen.findByText(
        'This club moved to District 201 after June 30, 2026.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open as District 201' })
    ).toHaveAttribute('href', '/district/201/club/977')
    expect(analyticsDistricts()).toContain('201')
    expect(screen.getByTestId('loc')).toHaveTextContent('/district/01/club/977')
    // The 975 KB index is not needed when the 12 KB shard answers.
    expect(mockedIndex).not.toHaveBeenCalled()
  })

  it('shows no banner when the URL district is right for the year', async () => {
    renderAt('/district/201/club/977')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByText(/this club was in District/)).toBeNull()
    expect(screen.queryByText(/This club moved to/)).toBeNull()
  })

  it('dates the moved-club copy when only the index can place the club', async () => {
    // The history has no entry for 2027-28, so the page cannot pick another
    // district's data: D01 heals to its newest year (2026-27), which lacks
    // the club. The index says where the club is now; the history dates it.
    renderAt('/district/01/club/977?py=2027')
    expect(
      await screen.findByText(/moved to District 201 after June 30, 2026/)
    ).toBeInTheDocument()
  })

  // #2079 (Ron's decision): the club-district history wins. D201's
  // 2026-06-30 file lists club 977, but the history places 2025-26 in D01.
  it("follows the history, not the URL district's June file, for the PY's close (#2079)", async () => {
    renderAt('/district/201/club/977?py=2025')

    expect(
      await screen.findByText('In 2025–26 this club was in District 1.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Showing its District 1 figures for 2025–26.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open as District 1' })
    ).toHaveAttribute('href', '/district/01/club/977?py=2025')
    // The history is consulted first: D201's 2025-26 data is never read.
    expect(analyticsDistricts()).toContain('01')
    expect(analyticsDistricts()).not.toContain('201')
    expect(screen.getByTestId('loc')).toHaveTextContent(
      '/district/201/club/977?py=2025'
    )
  })

  it('keeps the URL district when the history agrees with it for an explicit year', async () => {
    renderAt('/district/201/club/977?py=2026')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByText(/this club was in District/)).toBeNull()
    expect(screen.queryByText(/This club moved to/)).toBeNull()
    expect(new Set(analyticsDistricts())).toEqual(new Set(['201']))
  })

  it("keeps the URL district's data when the history does not list the club", async () => {
    mockedShard.mockResolvedValue({
      ...(shard77 as ClubDistrictHistoryShard),
      clubs: {},
    })
    renderAt('/district/201/club/977?py=2025')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByText(/this club was in District/)).toBeNull()
    expect(new Set(analyticsDistricts())).toEqual(new Set(['201']))
  })
})
