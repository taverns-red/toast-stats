/**
 * DistrictDetailPage — the rankings row has TWO consumers, and both must be
 * scoped to the displayed program year (#1396).
 *
 * The reported bug was the Payment Composition card (DistrictOverview). But
 * `DistrictDetailPage` reads the SAME `useDistrictRanking` row to build
 * `distinguishedRankingInputs`, which derives the trophy-case headline integers
 * whenever the canonical `*Remaining` fields are absent or the next tier is
 * above Distinguished (#840). That path is reachable on a past-year view —
 * `useCompetitiveAwards` is date-scoped, so a past year's `nextTierGap` was
 * being counted down against the CURRENT year's paidClubs/payments.
 *
 * Fixtures are chosen so the two years derive visibly different integers:
 *
 *   past  (base 100 clubs / 1000 payments / 10 distinguished, tier Select)
 *         → 103-100 = 3 clubs · 1030-1000 = 30 payments · 50-10 = 40 clubs
 *   current (base 200 / 2000 / 20)
 *         → 206-200 = 6 clubs · 2060-2000 = 60 payments · 100-20 = 80 clubs
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
import type { CdnRankingsData } from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'
import type { SnapshotDate } from '../../types/snapshotDate'

// ---------------------------------------------------------------------------
// Environment shims (mirrors the DistrictDetailPage.leanHub harness)
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
// Fixtures — the rankings rows the two years must NOT share
// ---------------------------------------------------------------------------

type Row = CdnRankingsData['rankings'][number]

function row(v: {
  paidClubBase: number
  paidClubs: number
  paymentBase: number
  totalPayments: number
  distinguishedClubs: number
}): Row {
  return {
    districtId: '61',
    districtName: 'District 61',
    region: '07',
    clubGrowthPercent: 0,
    paymentGrowthPercent: 0,
    activeClubs: v.paidClubs,
    selectDistinguished: 0,
    presidentsDistinguished: 0,
    distinguishedPercent: 10,
    clubsRank: 10,
    paymentsRank: 12,
    distinguishedRank: 14,
    aggregateScore: 400,
    overallRank: 11,
    ...v,
  }
}

/** No `snapshotDate` — the shape `v1/rankings.json` (the latest path) returns. */
const CURRENT: CdnRankingsData = {
  rankings: [
    row({
      paidClubBase: 200,
      paidClubs: 200,
      paymentBase: 2000,
      totalPayments: 2000,
      distinguishedClubs: 20,
    }),
  ],
  asOfDate: '2026-06-30',
  generatedAt: '2026-06-30T00:00:00Z',
}

/** The same row served as a real per-date hit for the current year. */
const CURRENT_PINNED: CdnRankingsData = {
  ...CURRENT,
  snapshotDate: snap('2026-06-30'),
}

const PAST: CdnRankingsData = {
  rankings: [
    row({
      paidClubBase: 100,
      paidClubs: 100,
      paymentBase: 1000,
      totalPayments: 1000,
      distinguishedClubs: 10,
    }),
  ],
  snapshotDate: snap('2025-06-30'),
  asOfDate: '2025-07-18',
  generatedAt: '2025-07-18T00:00:00Z',
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
  }
})

// The header's freshness pill shares `useDistrictRanking`'s 'latest' key
// (#1321). Mock it so `fetchCdnRankings` has exactly ONE possible caller left:
// a rankings consumer that failed to scope itself to the displayed year.
vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useLatestAsOfDate: () => ({
    asOfDate: undefined,
    latestSnapshotDate: undefined,
  }),
  useGlobalFreshness: () => ({ asOfDate: undefined, isLatest: false }),
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    // PY2024 → 2025-06-30 · PY2025 → 2026-06-30
    data: { dates: ['2026-06-30', '2025-06-30'] },
    isLoading: false,
    error: null,
  })),
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

// No canonical `*Remaining` fields and a next tier ABOVE Distinguished — the
// exact shape that forces the rankings-row derivation (#840).
vi.mock('../../hooks/useCompetitiveAwards', () => ({
  useCompetitiveAwards: vi.fn(() => ({
    data: {
      distinguishedDistrict: {
        '61': {
          districtId: '61',
          currentTier: 'Distinguished',
          allPrerequisitesMet: true,
          prerequisites: {
            dspSubmitted: true,
            trainingMet: true,
            marketAnalysisSubmitted: true,
            communicationPlanSubmitted: true,
            regionAdvisorVisitMet: true,
          },
          nextTierGap: {
            tier: 'Select',
            paymentGrowthGap: 3,
            clubGrowthGap: 3,
            distinguishedPercentGap: 40,
            netClubGrowthGap: 3,
          },
        },
      },
    },
    isLoading: false,
  })),
}))

const mockedLatest = vi.mocked(fetchCdnRankings)
const mockedForDate = vi.mocked(fetchCdnRankingsForDate)

beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.getItem.mockReturnValue(null)
  mockedLatest.mockResolvedValue(CURRENT)
  mockedForDate.mockImplementation((date: SnapshotDate) =>
    Promise.resolve(date === '2025-06-30' ? PAST : CURRENT_PINNED)
  )
})
afterEach(() => cleanup())

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
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
}

const tileValues = () =>
  screen
    .getAllByTestId('gap-tile-value')
    .map(el => el.textContent?.trim() ?? '')

describe('DistrictDetailPage — trophy-case ranking inputs follow the PY (#1396)', () => {
  it("derives the gap tiles from the PAST year's rankings row", async () => {
    renderAt('/district/61?py=2024')

    await waitFor(() =>
      expect(screen.getByTestId('distinguished-gap-tiles')).toBeInTheDocument()
    )
    // 6 clubs / 60 payments / 80 clubs is the CURRENT year's derivation.
    await waitFor(() =>
      expect(tileValues()).toEqual(['3 clubs', '30 payments', '40 clubs'])
    )
    expect(mockedForDate).toHaveBeenCalledWith(snap('2025-06-30'))
    // Nothing may fall back to `v1/rankings.json` while a year is displayed.
    expect(mockedLatest).not.toHaveBeenCalled()
  })

  it("derives them from the current year's row on a current-year view", async () => {
    renderAt('/district/61?py=2025')

    await waitFor(() =>
      expect(screen.getByTestId('distinguished-gap-tiles')).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(tileValues()).toEqual(['6 clubs', '60 payments', '80 clubs'])
    )
  })
})
