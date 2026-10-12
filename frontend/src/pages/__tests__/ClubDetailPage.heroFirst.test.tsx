/**
 * Hero first, analytics after (#1901, mobile epic #1827).
 *
 * The club page's LCP element is the hero h1. It used to wait on
 * `district_<id>_analytics.json`: 150 KB on the wire, 3.65 MB decoded, the
 * whole district's trends, all to render one club. Under applied mobile
 * throttling the h1 painted at 6.7 s, right after that file. The district
 * snapshot (`district_<id>.json`) is already read for per-goal data, and its
 * `clubs[]` record carries the same transformed hero fields that analytics
 * copies into `ClubTrend`.
 *
 * The contract pinned here:
 * - the hero renders from the snapshot record while analytics is pending;
 * - the analytics read is not even started until the snapshot read has
 *   settled and that hero has painted;
 * - analytics-derived pills (health, tier) are placeholders until then.
 *
 * R22: full-page mount, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { useDistrictStatistics } from '../../hooks/useMembershipData'

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
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      districtId: '61',
      dates: ['2026-10-11'],
      count: 1,
      dateRange: { startDate: '2026-10-11', endDate: '2026-10-11' },
    },
    isPending: false,
    isError: false,
  })),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-10-11'],
    count: 1,
    generatedAt: '2026-10-12T00:00:00Z',
  }),
  fetchCdnRankings: vi
    .fn()
    .mockResolvedValue({ rankings: [], asOfDate: '2026-10-11' }),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-11' }),
  fetchCdnGlobalClubRace: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
  ClubTrend: {},
}))

/** The snapshot's transformed club record — the real shape of
 *  `district_61.json` → `data.clubs[]` (prod 2026-10-11, 90 Elgin). */
const snapshotClub = {
  clubId: '7238597',
  clubName: '90 Elgin Toastmasters',
  divisionId: 'C',
  areaId: '23',
  membershipCount: 10,
  paymentsCount: 21,
  dcpGoals: 4,
  status: 'Active',
  divisionName: 'Division C',
  areaName: 'Area 23',
  charterDate: '2019-04-30',
  address: {
    street: '90 Elgin Street',
    city: 'Ottawa',
    region: 'ON',
    postalCode: 'K1P 5E9',
    country: 'Canada',
  },
  meetingDay: 'Tuesdays',
  meetingTime: '12:00',
  allowsVirtualAttendance: true,
  isProspective: false,
}

const snapshot = {
  districtId: '61',
  districtName: 'District 61',
  data: {
    districtId: '61',
    snapshotDate: '2026-10-11',
    clubs: [snapshotClub],
    clubPerformance: [],
    divisionPerformance: [],
  },
}

const mockedAnalytics = vi.mocked(useDistrictAnalytics)
const mockedStats = vi.mocked(useDistrictStatistics)

/** A real-shaped hook: disabled ⇒ idle (no data, not loading); enabled ⇒
 *  in flight (pending). Analytics never resolves in these tests — the point
 *  is what renders, and what is requested, before it does. */
function analyticsInFlight() {
  mockedAnalytics.mockImplementation(((
    districtId: string | null,
    _start?: string,
    _end?: string,
    options?: { enabled?: boolean }
  ) => {
    const enabled = !!districtId && (options?.enabled ?? true)
    return {
      data: undefined,
      isLoading: enabled,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }
  }) as never)
}

const analyticsEnabledCalls = () =>
  mockedAnalytics.mock.calls.filter(
    c =>
      !!c[0] && (c[3] as { enabled?: boolean } | undefined)?.enabled !== false
  )

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  analyticsInFlight()
})

function renderAt(url = '/district/61/club/7238597') {
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

describe('ClubDetailPage — hero first, analytics after (#1901)', () => {
  it('renders the hero from the district snapshot while analytics is pending', async () => {
    mockedStats.mockReturnValue({ data: snapshot, isLoading: false } as never)

    renderAt()

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '90 Elgin Toastmasters',
      })
    ).toBeInTheDocument()
    // Snapshot-sourced hero fields, verbatim.
    expect(screen.getAllByText('Area 23').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Division C').length).toBeGreaterThan(0)
    // Analytics-derived health pill: a placeholder, not a guess.
    expect(screen.getByTestId('club-hero-pill-placeholder')).toBeInTheDocument()
    expect(screen.queryByText('Thriving')).not.toBeInTheDocument()
    expect(screen.queryByText('Intervention required')).not.toBeInTheDocument()
  })

  it('does not start the analytics read while the snapshot read is in flight', async () => {
    mockedStats.mockReturnValue({ data: undefined, isLoading: true } as never)

    renderAt()
    await new Promise(resolve => setTimeout(resolve, 400))

    expect(analyticsEnabledCalls()).toHaveLength(0)
  })

  it('starts the analytics read once the snapshot hero has painted', async () => {
    mockedStats.mockReturnValue({ data: snapshot, isLoading: false } as never)

    renderAt()

    // First render: the hero has not painted yet, so analytics is held.
    const first = mockedAnalytics.mock.calls.find(c => !!c[0])
    expect((first?.[3] as { enabled?: boolean } | undefined)?.enabled).toBe(
      false
    )
    await waitFor(() =>
      expect(analyticsEnabledCalls().length).toBeGreaterThan(0)
    )
  })

  it('still starts analytics when the club is not in the snapshot (moved-club path)', async () => {
    mockedStats.mockReturnValue({
      data: { ...snapshot, data: { ...snapshot.data, clubs: [] } },
      isLoading: false,
    } as never)

    renderAt()

    await waitFor(() =>
      expect(analyticsEnabledCalls().length).toBeGreaterThan(0)
    )
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('still starts analytics when the snapshot read fails', async () => {
    mockedStats.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never)

    renderAt()

    await waitFor(() =>
      expect(analyticsEnabledCalls().length).toBeGreaterThan(0)
    )
  })
})
