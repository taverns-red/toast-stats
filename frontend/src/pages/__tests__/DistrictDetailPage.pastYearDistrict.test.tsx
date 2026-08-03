/**
 * DistrictDetailPage (#1398) — a district that existed in the SELECTED program
 * year must render its district page, not the limited Global-Rankings fallback.
 *
 * `districtsData && !selectedDistrict` at DistrictDetailPage:370 is an
 * existence gate over `useDistricts()`. That hook read the undated
 * `fetchCdnRankings()` — the CURRENT year only — so every district realigned
 * away since (38 of them: 132 in the 2025-06-30 snapshot vs 94 today) was
 * judged not to exist on ANY year's URL. D27 is the concrete case.
 *
 * The gate itself is correct and stays: a district present in neither year
 * still has to reach the fallback, which is why the third test exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import DistrictDetailPage from '../DistrictDetailPage'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../../services/cdn'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import type { CdnRankingsData } from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'
import type { SnapshotDate } from '../../types/snapshotDate'

// ---------------------------------------------------------------------------
// Environment shims (mirrors the DistrictDetailPage.rankingProgramYear harness)
// ---------------------------------------------------------------------------

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(() => null),
}
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null
  readonly rootMargin: string = ''
  readonly scrollMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []
  private readonly callback: (
    entries: IntersectionObserverEntry[],
    observer: IntersectionObserver
  ) => void
  constructor(
    callback: (
      entries: IntersectionObserverEntry[],
      observer: IntersectionObserver
    ) => void
  ) {
    this.callback = callback
  }
  observe(target: Element): void {
    setTimeout(() => {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this
      )
    }, 0)
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
Object.defineProperty(global, 'IntersectionObserver', {
  value: MockIntersectionObserver,
  writable: true,
})

// ---------------------------------------------------------------------------
// Fixtures — the district rosters the two years do NOT share
// ---------------------------------------------------------------------------

type Row = CdnRankingsData['rankings'][number]

function row(districtId: string): Row {
  return {
    districtId,
    districtName: districtId,
    region: '06',
    paidClubs: 90,
    paidClubBase: 88,
    clubGrowthPercent: 2,
    totalPayments: 2919,
    paymentBase: 2754,
    paymentGrowthPercent: 6,
    activeClubs: 92,
    distinguishedClubs: 38,
    selectDistinguished: 4,
    presidentsDistinguished: 14,
    distinguishedPercent: 43,
    clubsRank: 29,
    paymentsRank: 20,
    distinguishedRank: 71,
    aggregateScore: 279,
    overallRank: 33,
  }
}

/** `v1/rankings.json` today — D27 has been realigned away. */
const CURRENT: CdnRankingsData = {
  rankings: [row('61')],
  asOfDate: '2026-08-02',
  generatedAt: '2026-08-02T00:00:00Z',
}

/** The same roster served as a real per-date hit for the current year. */
const CURRENT_PINNED: CdnRankingsData = {
  ...CURRENT,
  snapshotDate: snap('2026-06-30'),
}

/** The 2024-2025 year-end snapshot — D27 was a district then. */
const PY_2024: CdnRankingsData = {
  rankings: [row('61'), row('27')],
  snapshotDate: snap('2025-06-30'),
  asOfDate: '2025-07-18',
  generatedAt: '2025-07-18T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Module mocks — everything EXCEPT useDistricts, which is under test
// ---------------------------------------------------------------------------

vi.mock('../../services/cdn', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/cdn')>()
  return {
    ...actual,
    fetchCdnRankings: vi.fn(),
    fetchCdnRankingsForDate: vi.fn(),
  }
})

vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useLatestAsOfDate: () => ({
    asOfDate: undefined,
    latestSnapshotDate: undefined,
  }),
  useGlobalFreshness: () => ({ asOfDate: undefined, isLatest: false }),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(),
}))

/** PY2024 → 2025-06-30 · PY2025 → 2026-06-30. Re-applied every test, because a
    `mockReturnValue` set inside one would otherwise leak into the next. */
const DATES_LOADED = {
  data: { dates: ['2026-06-30', '2025-06-30'] },
  isLoading: false,
  error: null,
} as unknown as ReturnType<typeof useDistrictCachedDates>

const DATES_LOADING = {
  data: undefined,
  isLoading: true,
  error: null,
} as unknown as ReturnType<typeof useDistrictCachedDates>

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: {
      allClubs: [],
      distinguishedClubs: {
        total: 0,
        smedley: 0,
        presidents: 0,
        select: 0,
        distinguished: 0,
      },
      totalMembership: 1000,
      membershipChange: 0,
      performanceTargets: null,
    },
    isLoading: false,
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

vi.mock('../../hooks/usePerformanceTargets', () => ({
  usePerformanceTargets: vi.fn(() => ({ data: null, isLoading: false })),
}))

vi.mock('../../hooks/useCompetitiveAwards', () => ({
  useCompetitiveAwards: vi.fn(() => ({ data: null, isLoading: false })),
}))

const mockedLatest = vi.mocked(fetchCdnRankings)
const mockedForDate = vi.mocked(fetchCdnRankingsForDate)

beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.getItem.mockReturnValue(null)
  vi.mocked(useDistrictCachedDates).mockReturnValue(DATES_LOADED)
  mockedLatest.mockResolvedValue(CURRENT)
  mockedForDate.mockImplementation((date: SnapshotDate) =>
    Promise.resolve(date === '2025-06-30' ? PY_2024 : CURRENT_PINNED)
  )
})
afterEach(() => cleanup())

function renderAt(url: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route
              path="/district/:districtId"
              element={<DistrictDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
  return client
}

/**
 * The existence gate only fires once `districtsData` is defined — before that
 * the full page renders regardless. Asserting without waiting for the list to
 * land would pass in the loading window and prove nothing. Prefix-matched so
 * this is indifferent to whether the key carries a date.
 */
async function districtListLanded(client: QueryClient) {
  await waitFor(() =>
    expect(
      client
        .getQueriesData({ queryKey: ['districts'] })
        .some(([, data]) => data !== undefined)
    ).toBe(true)
  )
}

const LIMITED = /This district has limited data available/i

describe('DistrictDetailPage — past-year districts are reachable (#1398)', () => {
  it('renders the district page for a district that existed in the selected year', async () => {
    const client = renderAt('/district/27?py=2024&date=2025-06-30')
    await districtListLanded(client)

    // The full page header, not the "Back to Rankings" stub.
    await waitFor(() =>
      expect(screen.getByTestId('district-detail-lede')).toBeInTheDocument()
    )
    expect(screen.queryByText(LIMITED)).not.toBeInTheDocument()
    expect(mockedForDate).toHaveBeenCalledWith(snap('2025-06-30'))
  })

  it('still renders a current-year district on the current year', async () => {
    const client = renderAt('/district/61?py=2025&date=2026-06-30')
    await districtListLanded(client)

    await waitFor(() =>
      expect(screen.getByTestId('district-detail-lede')).toBeInTheDocument()
    )
    expect(screen.queryByText(LIMITED)).not.toBeInTheDocument()
  })

  it('does not flash the fallback while the snapshot index is still loading', async () => {
    // The 388KB per-district date index routinely loses the race to the 88KB
    // rankings.json, so there is a real window where the roster is loaded but
    // still the UNDATED one. Firing the gate in that window would flash the
    // "limited data" page at every past-year district before its real page.
    vi.mocked(useDistrictCachedDates).mockReturnValue(DATES_LOADING)

    const client = renderAt('/district/27?py=2024&date=2025-06-30')
    await districtListLanded(client)

    expect(screen.queryByText(LIMITED)).not.toBeInTheDocument()
  })

  it('keeps the Global-Rankings fallback for a district in no year', async () => {
    const client = renderAt('/district/99?py=2024&date=2025-06-30')
    await districtListLanded(client)

    await waitFor(() => expect(screen.getByText(LIMITED)).toBeInTheDocument())
    expect(screen.queryByTestId('district-detail-lede')).not.toBeInTheDocument()
  })
})
