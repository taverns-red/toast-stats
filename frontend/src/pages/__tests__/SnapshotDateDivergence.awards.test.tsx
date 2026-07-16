/**
 * Snapshot-date divergence tests for the three remaining per-snapshot
 * competitive-awards consumers (#1322, epic #1319 Sprint 3).
 *
 * THE RULE these lock in: a per-snapshot CDN file lives under the **snapshot
 * date**, so `useCompetitiveAwards` must be keyed on the page-owned snapshot
 * date — never on the as-of `sourceCsvDate` that arrives on the rankings
 * response. The as-of date is display/provenance only.
 *
 * Every test below runs inside the month-end closing window, where the two
 * dates diverge (live 2026-07-06: snapshot 2026-06-30, sourceCsvDate
 * 2026-07-05). That divergence is the whole point: the dates are equal ~340
 * days a year, so a fixture that sets them equal cannot observe the wrong
 * keying at all — which is exactly why RegionPage's own suite sailed past
 * #1315, the fourth recurrence of this bug.
 *
 * Live, the wrong key fetches `snapshots/2026-07-05/competitive-awards.json`,
 * which 404s → `fetchCdnCompetitiveAwards` returns null → the awards race /
 * trophy case / standings render blank, with no error to notice.
 *
 * `RegionPage.programYear.test.tsx` already covers RegionPage, and
 * `SnapshotDateDivergence.test.tsx` (#1321) covers Division/Area visit-round
 * gating. These three are the consumers that had no divergence test.
 *
 * @see tasks/lessons/lessons/key-per-snapshot-fetches-on-the-snapshot-date-not-the-as-of-sourcecsvdate.md
 */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import {
  fetchCdnCompetitiveAwards,
  type CompetitiveAwardStandings,
} from '../../services/cdn'
import DistrictsPage from '../DistrictsPage'
import AwardsPage from '../AwardsPage'
import DistrictDetailPage from '../DistrictDetailPage'

/** The pinned snapshot every per-snapshot file is stored under. */
const SNAPSHOT_DATE = '2026-06-30'
/** The dashboard as-of date, advanced past the snapshot by reconciliation. */
const AS_OF_DATE = '2026-07-05'

const standings: CompetitiveAwardStandings = {
  metadata: {
    snapshotId: SNAPSHOT_DATE,
    calculatedAt: '2026-07-05T00:00:00Z',
    totalDistricts: 1,
  },
  extensionAward: [
    {
      districtId: '61',
      districtName: 'District 61',
      region: '6',
      rank: 1,
      value: 5,
      isWinner: false,
    },
  ],
  twentyPlusAward: [],
  retentionAward: [],
  byDistrict: {},
}

const ranking = {
  districtId: '61',
  districtName: 'District 61',
  region: '6',
  paidClubs: 105,
  paidClubBase: 100,
  clubGrowthPercent: 5,
  totalPayments: 4500,
  paymentBase: 4400,
  paymentGrowthPercent: 2.27,
  activeClubs: 105,
  distinguishedClubs: 50,
  selectDistinguished: 10,
  presidentsDistinguished: 5,
  distinguishedPercent: 61.9,
  clubsRank: 1,
  paymentsRank: 1,
  distinguishedRank: 1,
  aggregateScore: 250,
  overallRank: 1,
}

vi.mock('../../services/cdn', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/cdn')>()
  return {
    ...actual,
    fetchCdnSnapshotIndex: vi.fn(),
    fetchCdnDates: vi.fn(),
    fetchCdnManifest: vi.fn(),
    fetchCdnRankings: vi.fn(),
    fetchCdnRankingsForDate: vi.fn(),
    fetchCdnCompetitiveAwards: vi.fn(),
  }
})

// AwardsPage/DistrictDetailPage source the freshness pill from this shared
// hook; it is not the subject here.
vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useLatestAsOfDate: () => ({
    asOfDate: AS_OF_DATE,
    latestSnapshotDate: SNAPSHOT_DATE,
    isLatest: true,
  }),
}))

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
    isLoading: false,
    error: null,
  })),
}))

// The district's snapshot index — snapshot dates only. The as-of date is NOT a
// snapshot date and never appears here; that asymmetry is the bug's shape.
vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: { dates: [SNAPSHOT_DATE] },
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}))
vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: null, isLoading: false })),
}))
vi.mock('../../hooks/useLeadershipInsights', () => ({
  useLeadershipInsights: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}))
vi.mock('../../hooks/useDistinguishedClubAnalytics', () => ({
  useDistinguishedClubAnalytics: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}))
vi.mock('../../hooks/usePaymentsTrend', () => ({
  usePaymentsTrend: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}))
vi.mock('../../hooks/useTimeSeries', () => ({
  useTimeSeries: vi.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}))
vi.mock('../../hooks/useAggregatedAnalytics', () => ({
  useAggregatedAnalytics: vi.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    usedFallback: false,
  })),
}))
vi.mock('../../hooks/useRankHistory', () => ({
  useRankHistory: vi.fn(() => ({ data: null, isLoading: false, error: null })),
}))

// Keep Recharts out of JSDOM.
vi.mock('../../components/MembershipTrendChart', () => ({
  MembershipTrendChart: () => <div data-testid="membership-trend-chart" />,
}))
vi.mock('../../components/YearOverYearComparison', () => ({
  YearOverYearComparison: () => <div data-testid="year-over-year-comparison" />,
}))

const mockedAwards = vi.mocked(fetchCdnCompetitiveAwards)

/**
 * Assert the awards fetch resolved to the pinned snapshot, not the as-of date.
 * Both halves matter: `toHaveBeenCalledWith(SNAPSHOT_DATE)` alone would pass a
 * consumer that fetched BOTH dates.
 */
async function expectAwardsKeyedOnSnapshotDate() {
  await waitFor(() => expect(mockedAwards).toHaveBeenCalled())
  expect(mockedAwards).toHaveBeenCalledWith(SNAPSHOT_DATE)
  expect(mockedAwards).not.toHaveBeenCalledWith(AS_OF_DATE)
}

function renderAt(url: string, path: string, element: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path={path} element={element} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

beforeEach(async () => {
  localStorage.clear()
  vi.clearAllMocks()
  const cdn = await import('../../services/cdn')
  // Snapshot index / dates carry SNAPSHOT dates only.
  vi.mocked(cdn.fetchCdnSnapshotIndex).mockResolvedValue({
    '61': [SNAPSHOT_DATE],
  })
  vi.mocked(cdn.fetchCdnDates).mockResolvedValue({
    dates: [SNAPSHOT_DATE],
    count: 1,
    generatedAt: '2026-07-05T00:00:00Z',
  })
  vi.mocked(cdn.fetchCdnManifest).mockResolvedValue({
    latestSnapshotDate: SNAPSHOT_DATE,
    generatedAt: '2026-07-05T00:00:00Z',
  })
  // The rankings response carries the ADVANCED as-of date — the poisoned well.
  // A consumer that reaches for `asOfDate` to key its awards fetch gets the
  // closing-window 404. `mockResolvedValue` (not Once): these queries fetch
  // more than once across a render lifecycle (Lesson 59).
  vi.mocked(cdn.fetchCdnRankingsForDate).mockResolvedValue({
    rankings: [ranking],
    asOfDate: AS_OF_DATE,
    snapshotDate: SNAPSHOT_DATE,
    generatedAt: '2026-07-05T00:00:00Z',
  })
  vi.mocked(cdn.fetchCdnRankings).mockResolvedValue({
    rankings: [ranking],
    asOfDate: AS_OF_DATE,
    generatedAt: '2026-07-05T00:00:00Z',
  })
  // Date-AWARE, mirroring the bucket: the awards file exists only under the
  // snapshot date, and `fetchCdnCompetitiveAwards` maps the 404 to null. A
  // date-blind `mockResolvedValue(standings)` would hand the same payload to a
  // wrongly-keyed consumer and rubber-stamp the bug — the harness must be as
  // honest as the wire, or the content assertion below proves nothing.
  mockedAwards.mockImplementation(async (date: string) =>
    date === SNAPSHOT_DATE ? standings : null
  )
})

afterEach(() => cleanup())

describe('snapshot-date divergence — competitive-awards keying (#1322)', () => {
  it('DistrictsPage keys the awards race on the snapshot date, not the as-of date', async () => {
    renderAt('/', '/', <DistrictsPage />)
    await expectAwardsKeyedOnSnapshotDate()
  })

  it('AwardsPage keys the standings on the snapshot date, not the as-of date', async () => {
    renderAt('/awards', '/awards', <AwardsPage />)
    await expectAwardsKeyedOnSnapshotDate()
  })

  it('DistrictDetailPage keys the trophy case on the snapshot date, not the as-of date', async () => {
    renderAt('/districts/61', '/districts/:districtId', <DistrictDetailPage />)
    await expectAwardsKeyedOnSnapshotDate()
  })

  it('renders awards content in the closing window (the 404 would blank it)', async () => {
    // The keying assertions above prove the ARGUMENT; this proves the
    // consequence — that awards data actually reaches the UI while the two
    // dates diverge. A snapshot-date 404 renders this section empty.
    renderAt('/awards', '/awards', <AwardsPage />)
    await waitFor(() => expect(mockedAwards).toHaveBeenCalled())
    expect(await screen.findByText(/District 61/i)).toBeInTheDocument()
  })
})
