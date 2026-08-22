/**
 * DistrictDetailPage (#1436) — the degraded "limited data" view must carry a
 * program-year selector.
 *
 * `:383` returns early, BEFORE `DistrictDetailHeader` — the only component that
 * receives `selectedProgramYear` / `setSelectedProgramYear` /
 * `availableProgramYears`. So a district absent from the selected year's roster
 * was stranded on the one year with nothing: `GlobalRankingsTab` (rendered
 * inside the branch) has only a metric toggle, no year control.
 *
 * Two distinct year sources, both exercised here:
 *   - a district WITH a snapshot-index entry → its snapshot years (the source
 *     the page already reads via `useDistrictCachedDates`), and switching to a
 *     year whose roster has it renders the full view;
 *   - a district with NO index entry (the reported case, D44) → its
 *     rank-history years, because `index['44'] ?? []` is empty.
 *
 * R22: this mounts a page, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  useSearchParams,
} from 'react-router-dom'
import DistrictDetailPage from '../DistrictDetailPage'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import {
  fetchCdnRankings,
  fetchCdnRankingsForDate,
  fetchCdnRankHistory,
  fetchCdnDates,
} from '../../services/cdn'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import type { CdnRankingsData, CdnRankHistoryData } from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'
import type { SnapshotDate } from '../../types/snapshotDate'

// ---------------------------------------------------------------------------
// Environment shims (mirrors the DistrictDetailPage.pastYearDistrict harness)
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
// Fixtures
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

/** The CURRENT roster — neither D27 nor D44 is in it. */
const CURRENT: CdnRankingsData = {
  rankings: [row('61')],
  asOfDate: '2026-08-02',
  generatedAt: '2026-08-02T00:00:00Z',
}

const CURRENT_PINNED: CdnRankingsData = {
  ...CURRENT,
  snapshotDate: snap('2026-06-30'),
}

/** The 2024-2025 year-end roster — D27 and D44 were both districts then. */
const PY_2024: CdnRankingsData = {
  rankings: [row('61'), row('27'), row('44')],
  snapshotDate: snap('2025-06-30'),
  asOfDate: '2025-07-18',
  generatedAt: '2025-07-18T00:00:00Z',
}

function historyPoint(date: string) {
  return {
    date,
    aggregateScore: 279,
    clubsRank: 29,
    paymentsRank: 20,
    distinguishedRank: 71,
    totalDistricts: 128,
    overallRank: 41,
  }
}

/** D44 appears in the rankings for PY 2024-2025 only — and has no snapshot. */
const D44_RANK_HISTORY: CdnRankHistoryData = {
  districtId: '44',
  districtName: '44',
  history: [historyPoint('2024-12-31'), historyPoint('2025-06-30')],
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/cdn', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/cdn')>()
  return {
    ...actual,
    fetchCdnRankings: vi.fn(),
    fetchCdnRankingsForDate: vi.fn(),
    fetchCdnRankHistory: vi.fn(),
    fetchCdnDates: vi.fn(),
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
const mockedRankHistory = vi.mocked(fetchCdnRankHistory)
const mockedDates = vi.mocked(fetchCdnDates)

/** D44 has no `district-snapshot-index.json` entry — the reported case. */
const NO_SNAPSHOTS = {
  data: { districtId: '44', dates: [], count: 0, dateRange: null },
  isLoading: false,
  error: null,
} as unknown as ReturnType<typeof useDistrictCachedDates>

/** D27 has snapshots in both years. */
const DATES_LOADED = {
  data: { dates: ['2026-06-30', '2025-06-30'] },
  isLoading: false,
  error: null,
} as unknown as ReturnType<typeof useDistrictCachedDates>

beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.getItem.mockReturnValue(null)
  vi.mocked(useDistrictCachedDates).mockReturnValue(NO_SNAPSHOTS)
  mockedLatest.mockResolvedValue(CURRENT)
  mockedForDate.mockImplementation((date: SnapshotDate) =>
    Promise.resolve(date === '2025-06-30' ? PY_2024 : CURRENT_PINNED)
  )
  mockedRankHistory.mockResolvedValue(D44_RANK_HISTORY)
  mockedDates.mockResolvedValue({
    dates: ['2025-06-30', '2026-06-30'],
    count: 2,
    generatedAt: '2026-08-02T00:00:00Z',
  })
})
afterEach(() => cleanup())

// The URL is the artefact under test for the `?py=` / `?date=` consistency
// criterion, so record EVERY search string the router commits — a transiently
// inconsistent pair is as much a defect as a final one.
const seenSearches: string[] = []

function UrlProbe() {
  const loc = useLocation()
  const [sp] = useSearchParams()
  React.useEffect(() => {
    seenSearches.push(sp.toString())
  }, [loc.key, sp])
  return null
}

function renderAt(url: string) {
  seenSearches.length = 0
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
          <UrlProbe />
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
  return client
}

async function districtListLanded(client: QueryClient) {
  await waitFor(() =>
    expect(
      client
        .getQueriesData({ queryKey: ['districts'] })
        .some(([, data]) => data !== undefined)
    ).toBe(true)
  )
}

/** PY start year → [startDate, endDate], for the consistency assertion. */
function programYearBounds(year: number) {
  return [`${year}-07-01`, `${year + 1}-06-30`] as const
}

function assertNoInconsistentUrl() {
  for (const search of seenSearches) {
    const params = new URLSearchParams(search)
    const py = params.get('py')
    const date = params.get('date')
    if (py === null || date === null) continue
    const [start, end] = programYearBounds(parseInt(py, 10))
    expect(
      date >= start && date <= end,
      `?date=${date} is outside ?py=${py} (${start}..${end}) in "${search}"`
    ).toBe(true)
  }
}

/**
 * The selector's slot is reserved with a skeleton while the rank-history query
 * is in flight (no late insert above GlobalRankingsTab), so the testid lands
 * before the <select> does — wait for the control itself, not the wrapper.
 */
async function findYearSelect() {
  return waitFor(() =>
    within(screen.getByTestId('degraded-program-year-selector')).getByRole(
      'combobox',
      { name: /program year/i }
    )
  )
}

const LIMITED = /This district has limited data available/i

describe('DistrictDetailPage — degraded view year selector (#1436)', () => {
  it('offers the rank-history years for a district with no snapshot index entry', async () => {
    const client = renderAt('/district/44?py=2025')
    await districtListLanded(client)

    await waitFor(() => expect(screen.getByText(LIMITED)).toBeInTheDocument())

    const selector = await screen.findByTestId('degraded-program-year-selector')
    expect(selector).toBeInTheDocument()

    // D44's rank history covers PY 2024-2025 only.
    const select = await findYearSelect()
    expect(
      within(select).getByRole('option', { name: /2024-2025/ })
    ).toBeInTheDocument()
  })

  it('names a year that does have data instead of leaving the user to guess', async () => {
    const client = renderAt('/district/44?py=2025')
    await districtListLanded(client)

    await waitFor(() =>
      expect(screen.getByTestId('limited-data-banner')).toHaveTextContent(
        /2024-2025/
      )
    )
  })

  it('sets ?py= and ?date= consistently when the year changes', async () => {
    const user = userEvent.setup()
    const client = renderAt('/district/44?py=2025&date=2026-06-30')
    await districtListLanded(client)

    await user.selectOptions(await findYearSelect(), '2024')

    // D44 has no snapshot in ANY year, so there is no in-year date to offer —
    // `?date=` must be dropped, never left pointing at the old year.
    await waitFor(() => {
      const last = seenSearches[seenSearches.length - 1] ?? ''
      expect(new URLSearchParams(last).get('py')).toBe('2024')
      expect(new URLSearchParams(last).get('date')).toBeNull()
    })
    assertNoInconsistentUrl()
  })

  it('reaches the full view by switching to a year whose roster has the district', async () => {
    // D27 HAS snapshots in both years, so its year list comes from the snapshot
    // index; the current year's roster simply omits it.
    vi.mocked(useDistrictCachedDates).mockReturnValue(DATES_LOADED)
    const user = userEvent.setup()
    const client = renderAt('/district/27?py=2025&date=2026-06-30')
    await districtListLanded(client)

    await waitFor(() => expect(screen.getByText(LIMITED)).toBeInTheDocument())

    await user.selectOptions(await findYearSelect(), '2024')

    await waitFor(() =>
      expect(screen.getByTestId('district-detail-lede')).toBeInTheDocument()
    )
    expect(screen.queryByText(LIMITED)).not.toBeInTheDocument()
    assertNoInconsistentUrl()
  })

  it('degrades gracefully for a district with no snapshots and no rank history', async () => {
    mockedRankHistory.mockRejectedValue(new Error('404'))
    const client = renderAt('/district/999?py=2025')
    await districtListLanded(client)

    await waitFor(() => expect(screen.getByText(LIMITED)).toBeInTheDocument())
    expect(
      screen.queryByTestId('degraded-program-year-selector')
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('limited-data-banner')).toHaveTextContent(
      /not yet tracked/i
    )
  })

  it('leaves the happy path unchanged — no degraded chrome for a current district', async () => {
    vi.mocked(useDistrictCachedDates).mockReturnValue(DATES_LOADED)
    const client = renderAt('/district/61?py=2025&date=2026-06-30')
    await districtListLanded(client)

    await waitFor(() =>
      expect(screen.getByTestId('district-detail-lede')).toBeInTheDocument()
    )
    expect(screen.queryByText(LIMITED)).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('degraded-program-year-selector')
    ).not.toBeInTheDocument()
    // The rank-history fallback must not fire for a district that has snapshots.
    expect(mockedRankHistory).not.toHaveBeenCalled()
  })
})
