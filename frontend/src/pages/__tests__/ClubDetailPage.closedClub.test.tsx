/**
 * Club page for a closed club (#3104).
 *
 * `/district/86/club/28676407` (Top Tier Toastmasters) left Toastmasters'
 * list after 2025-06-30, so it is in no current file and the page used to
 * say "Club Not Found". The club-district history shard the page already
 * reads for an absent club knows it closed, where and when; the district
 * analytics file at that last date holds its last program year. The page
 * shows that history, and hides what needs current data.
 *
 * Load contract: one extra read (the analytics file at the last date), and
 * no 975 KB club index, which by construction never lists a closed club.
 *
 * Fixtures are recorded from cdn.taverns.red on 2026-11-20 and trimmed to
 * the club (plus one neighbour in the analytics file).
 *
 * R22: this is a full-page mount, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  screen,
  render,
  cleanup,
  within,
  fireEvent,
} from '@testing-library/react'
import '@testing-library/jest-dom'
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  useNavigationType,
} from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import type { ClubDistrictHistoryShard } from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import {
  fetchCdnClubIndex,
  fetchCdnReinstatableClubs,
  fetchCdnSuspendedClubs,
  fetchFromCdn,
} from '../../services/cdn'
import { fetchClubDistrictHistoryShard } from '../../services/cdnClubDistrictHistory'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import shard07 from '../../__tests__/fixtures/club-district-history-07-closed-28676407-2026-11-20.recorded.json'
import lastAnalytics from '../../__tests__/fixtures/district-86-analytics-2025-06-30-closed-28676407.recorded.json'

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
    data: { districts: [{ id: '86', name: '86' }] },
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      districtId: '86',
      dates: ['2026-11-19'],
      count: 1,
      dateRange: { startDate: '2026-11-19', endDate: '2026-11-19' },
    },
    isPending: false,
    isError: false,
  })),
}))

vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn(),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
  fetchFromCdn: vi.fn(),
  cdnAnalyticsUrl: (date: string, districtId: string, type: string) =>
    `https://cdn.test/snapshots/${date}/analytics/district_${districtId}_${type}.json`,
  fetchCdnSuspendedClubs: vi.fn().mockResolvedValue(null),
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

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: null, isLoading: false })),
}))

// The current program year's D86 analytics: the club is not in it.
const openClub = {
  clubId: '1234',
  clubName: 'Open Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  membershipTrend: [{ date: '2026-11-19', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-11-19', goalsAchieved: 2 }],
  membershipBase: 20,
  currentStatus: 'thriving' as const,
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished' as const,
}
vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(
    (
      districtId: string | null,
      _s?: string,
      _e?: string,
      o?: { enabled?: boolean }
    ) =>
      districtId && (o?.enabled ?? true)
        ? {
            data: { districtId: '86', allClubs: [openClub] },
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

const mockedShard = vi.mocked(fetchClubDistrictHistoryShard)
const mockedClubIndex = vi.mocked(fetchCdnClubIndex)
const mockedFetchFromCdn = vi.mocked(fetchFromCdn)
const mockedReinstatable = vi.mocked(fetchCdnReinstatableClubs)

// #3111 — the latest date's reinstatable-clubs.json, with the pipeline's
// period for the closed club (or without one).
function reinstatableFile(period?: {
  inactivePeriod: number
  lastChanceBy: string
}) {
  return {
    _format: { version: '1.0.0', type: 'reinstatable-clubs' },
    snapshotDate: '2026-11-19',
    baseProgramYear: '2026-2027',
    districts: {
      '86': [
        {
          clubNumber: '28676407',
          clubName: 'Top Tier Toastmasters',
          status: 'closed',
          lastSeen: '2025-06-30',
          addsToBase: false,
          reason: 'closed_does_not_add',
          ...period,
        },
      ],
    },
  }
}

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  mockedShard.mockResolvedValue(shard07 as unknown as ClubDistrictHistoryShard)
  mockedFetchFromCdn.mockImplementation(async (url: string) => {
    if (url.includes('/snapshots/2025-06-30/analytics/district_86_analytics'))
      return lastAnalytics
    throw new Error(`unexpected CDN read ${url}`)
  })
  mockedClubIndex.mockResolvedValue({ clubs: {} })
  mockedReinstatable.mockResolvedValue(reinstatableFile() as never)
})

// Where the router is, and how it got there (PUSH, REPLACE or POP).
const LocationProbe = () => {
  const { pathname } = useLocation()
  const type = useNavigationType()
  return (
    <div data-testid="loc">
      {pathname} {type}
    </div>
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
            <LocationProbe />
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

const settle = () => new Promise(resolve => setTimeout(resolve, 50))

describe('ClubDetailPage — a closed club shows its history (#3104)', () => {
  it('shows the closed line and the last program year instead of Not Found', async () => {
    renderAt('/district/86/club/28676407')

    expect(
      await screen.findByText(
        'Closed. Last on Toastmasters’ club list: June 30, 2025'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Club Not Found')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Top Tier Toastmasters' })
    ).toBeInTheDocument()

    // Last-known division and area, from the analytics at the last date.
    const hero = screen.getByRole('banner')
    expect(within(hero).getByText('Division S')).toBeInTheDocument()
    expect(within(hero).getByText('Area 71')).toBeInTheDocument()

    // History panels: the membership trend for 2024–25 and the DCP goals.
    expect(screen.getByText('Membership Trend')).toBeInTheDocument()
    expect(screen.getByText(/PY 2024–25/)).toBeInTheDocument()
    expect(screen.getByText('2 of 10 goals achieved')).toBeInTheDocument()
    // The district history from the shard.
    expect(screen.getByText(/Last record in District 86/)).toBeInTheDocument()
  })

  it('hides the sections that need current data', async () => {
    renderAt('/district/86/club/28676407')
    await screen.findByText(
      'Closed. Last on Toastmasters’ club list: June 30, 2025'
    )

    expect(
      screen.queryByRole('combobox', { name: /program year/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Risk Factors')).not.toBeInTheDocument()
    expect(screen.queryByText(/Close to Distinguished/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Worldwide standing/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Recent changes/i)).not.toBeInTheDocument()
  })

  it('reads one extra file and never the club index', async () => {
    renderAt('/district/86/club/28676407')
    await screen.findByText(
      'Closed. Last on Toastmasters’ club list: June 30, 2025'
    )
    await settle()

    expect(mockedFetchFromCdn).toHaveBeenCalledTimes(1)
    expect(mockedShard).toHaveBeenCalledTimes(1)
    expect(mockedClubIndex).not.toHaveBeenCalled()
    // The current district analytics is read once, as for any club page.
    expect(
      vi
        .mocked(useDistrictAnalytics)
        .mock.calls.filter(c => c[0] !== null && c[3]?.enabled !== false)
        .every(c => c[0] === '86')
    ).toBe(true)
  })

  it('keeps Not Found for a club no file knows', async () => {
    renderAt('/district/86/club/99999907')

    expect(await screen.findByText('Club Not Found')).toBeInTheDocument()
    expect(screen.queryByText(/Closed\. Last on/)).not.toBeInTheDocument()
    expect(mockedFetchFromCdn).not.toHaveBeenCalled()
  })

  it("replaces a URL naming another district with the club's last one", async () => {
    renderAt('/district/61/club/28676407')

    expect(
      await screen.findByText(
        'Closed. Last on Toastmasters’ club list: June 30, 2025'
      )
    ).toBeInTheDocument()
    // One REPLACE navigation: no extra history entry, and the breadcrumb
    // and hero agree on District 86.
    expect(screen.getByTestId('loc')).toHaveTextContent(
      '/district/86/club/28676407 REPLACE'
    )
    expect(screen.queryByText('District 61')).not.toBeInTheDocument()
  })

  it('shows the retry error, and no empty hero line, when the last-date read fails', async () => {
    mockedFetchFromCdn.mockRejectedValue(new Error('network down'))
    renderAt('/district/86/club/28676407')

    expect(await screen.findByText('Failed to Load Club')).toBeInTheDocument()
    const hero = screen.getByRole('banner')
    expect(
      within(hero).getByText(
        'Closed. Last on Toastmasters’ club list: June 30, 2025'
      )
    ).toBeInTheDocument()
    // No area or division: no separators around missing names.
    expect(hero.querySelectorAll('.club-hero__sub-divider')).toHaveLength(0)
    expect(within(hero).getByText('District 86')).toBeInTheDocument()

    mockedFetchFromCdn.mockResolvedValue(lastAnalytics)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('Membership Trend')).toBeInTheDocument()
    expect(mockedFetchFromCdn).toHaveBeenCalledTimes(2)
  })

  /* #3111 — a closed club the pipeline gives a period gets the same
     "Time left to reinstate" panel as a suspended one. */
  it('draws the reinstate window for a closed club with a period', async () => {
    mockedReinstatable.mockResolvedValue(
      reinstatableFile({
        inactivePeriod: 5,
        lastChanceBy: '2027-03-31',
      }) as never
    )
    renderAt('/district/86/club/28676407')
    const region = await screen.findByRole('region', {
      name: 'Time left to reinstate',
    })
    expect(
      within(region).getByTestId('reinstate-window-end')
    ).toHaveTextContent('Last chance: March 31, 2027')
    const now = within(region)
      .getAllByRole('listitem')
      .find(li => li.getAttribute('aria-current') === 'step')
    expect(now).toHaveTextContent('Period 5')
    expect(mockedReinstatable).toHaveBeenCalledWith('2026-11-19')
  })

  it('no reinstate window for a closed club without a period', async () => {
    renderAt('/district/86/club/28676407')
    await screen.findByText(
      'Closed. Last on Toastmasters’ club list: June 30, 2025'
    )
    await settle()
    expect(
      screen.queryByRole('region', { name: 'Time left to reinstate' })
    ).toBeNull()
  })
})

// #3117 — a club suspended on the first day of the program year is in no
// current file either, and its history's last span ended on June 30. It is
// still on the district's suspended list, so it can reinstate: the page
// must not call it closed. (Live case: 28678177, District 53, suspended
// 2026-07-01. The 28676407 fixtures stand in for it here.)
describe('ClubDetailPage — a suspended club missing from analytics (#3117)', () => {
  beforeEach(() => {
    vi.mocked(fetchCdnSuspendedClubs).mockResolvedValue({
      _format: { version: '1.0.0', type: 'suspended-clubs' },
      snapshotDate: '2026-11-19',
      programYear: { start: '2026-07-01', end: '2027-06-30' },
      districts: {
        '86': [
          {
            clubNumber: '28676407',
            clubName: 'Top Tier Toastmasters',
            division: 'S',
            area: '71',
            suspendDate: '2026-07-01',
          },
        ],
      },
    })
  })

  it('is not shown as closed and shows the suspended status', async () => {
    renderAt('/district/86/club/28676407')

    const hero = await screen.findByRole('banner')
    expect(
      await within(hero).findByText('Suspended since Jul 1, 2026')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Top Tier Toastmasters' })
    ).toBeInTheDocument()
    expect(screen.queryByText(/Closed\. Last on/)).not.toBeInTheDocument()
    expect(screen.queryByText(/This club has closed/)).not.toBeInTheDocument()
    expect(screen.queryByText('Club Not Found')).not.toBeInTheDocument()
    // The lifecycle panel carries the suspension too.
    expect(screen.getByText('Suspended')).toBeInTheDocument()
  })

  it('holds a skeleton while the suspended list loads', async () => {
    vi.mocked(fetchCdnSuspendedClubs).mockReturnValue(new Promise(() => {}))
    renderAt('/district/86/club/28676407')

    await vi.waitFor(() =>
      expect(vi.mocked(fetchCdnSuspendedClubs)).toHaveBeenCalled()
    )
    await settle()

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByText(/Closed\. Last on/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Suspended since/)).not.toBeInTheDocument()
    expect(screen.queryByText('Club Not Found')).not.toBeInTheDocument()
  })

  it('shows the closed page when the list does not include the club', async () => {
    vi.mocked(fetchCdnSuspendedClubs).mockResolvedValue({
      _format: { version: '1.0.0', type: 'suspended-clubs' },
      snapshotDate: '2026-11-19',
      programYear: { start: '2026-07-01', end: '2027-06-30' },
      districts: {
        '86': [
          {
            clubNumber: '1234',
            clubName: 'Open Club',
            division: 'A',
            area: '01',
            suspendDate: '2026-07-01',
          },
        ],
      },
    })
    renderAt('/district/86/club/28676407')

    expect(
      await screen.findByText(
        'Closed. Last on Toastmasters’ club list: June 30, 2025'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/Suspended since/)).not.toBeInTheDocument()
  })
})
