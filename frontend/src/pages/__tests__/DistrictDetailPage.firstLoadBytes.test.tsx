/**
 * District hub first-load bytes (#2513) — the Lighthouse mobile gate budgets
 * the total transfer of `/district/:id` and sits ~7 KB over it. The trophy
 * case's `competitive-awards.json` (~17 KB) feeds a card below the first
 * screen, so it must not be requested until that card nears the viewport
 * (the same latch the predecessor panel uses, #2427). The slot stays
 * reserved while held (#1105), so layout does not move.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, render, waitFor, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'
import DistrictDetailPage from '../DistrictDetailPage'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'

// ---------------------------------------------------------------------------
// Global mocks
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

import { fetchCdnCompetitiveAwards } from '../../services/cdn'

type IoCallback = ConstructorParameters<typeof IntersectionObserver>[0]

// An observer the test fires by hand: nothing is "near" until `fireNear()`.
const observed: Array<{ target: Element; cb: IoCallback }> = []
class ManualIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null
  readonly rootMargin: string = ''
  readonly scrollMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []
  constructor(private readonly cb: IoCallback) {}
  observe(target: Element): void {
    observed.push({ target, cb: this.cb })
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
Object.defineProperty(global, 'IntersectionObserver', {
  value: ManualIntersectionObserver,
  writable: true,
})
function fireNear(testId: string) {
  for (const o of observed) {
    if (o.target.getAttribute('data-testid') === testId) {
      o.cb(
        [
          {
            isIntersecting: true,
            target: o.target,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Hook mocks (mirrors the DistrictDetailPage.TrendsTab harness)
// ---------------------------------------------------------------------------

// #2405 — the page's own CDN reads, each settled in its 404 shape (the
// reader's documented "absent" contract). These tests assert page structure,
// not this data, and must never reach the live CDN.
vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  // v1/dates.json (ProgramYearProvider): the default PY falls back to the calendar.
  fetchCdnDates: vi
    .fn()
    .mockRejectedValue(new Error('CDN dates fetch failed: 404')),
  // v1/latest.json (freshness pill and latest-date reads).
  fetchCdnManifest: vi
    .fn()
    .mockRejectedValue(new Error('CDN manifest fetch failed: 404')),
  fetchLatestSnapshotDate: vi
    .fn()
    .mockRejectedValue(new Error('CDN manifest fetch failed: 404')),
  // v1/rankings.json and snapshots/{date}/all-districts-rankings.json.
  fetchCdnRankings: vi
    .fn()
    .mockRejectedValue(new Error('CDN rankings fetch failed: 404')),
  fetchCdnRankingsForDateExact: vi.fn().mockResolvedValue(null),
  fetchCdnRankingsForDate: vi
    .fn()
    .mockRejectedValue(new Error('CDN rankings fetch failed: 404')),
  // snapshots/{date}/competitive-awards.json.
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  // config/district-snapshot-index.json (club-growth milestones).
  fetchCdnSnapshotIndex: vi
    .fn()
    .mockRejectedValue(
      new Error('CDN fetch failed: 404 for config/district-snapshot-index.json')
    ),
  // config/district-region-history.json: the region comes from the rankings row.
  fetchCdnDistrictRegionHistory: vi.fn().mockResolvedValue(null),
}))

// #2405 — snapshots/{date}/analytics/district_{id}_performance-targets.json,
// settled with no data.
vi.mock('../../hooks/usePerformanceTargets', () => ({
  usePerformanceTargets: vi.fn(() => ({ data: null, isLoading: false })),
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: 'D42', name: 'Test District 42' }] },
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: { dates: ['2024-10-15', '2024-10-01'] },
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: {
      allClubs: [],
      interventionRequiredClubs: [],
      vulnerableClubs: [],
      distinguishedClubs: { total: 0 },
      distinguishedProjection: null,
      thrivingClubs: [],
      topGrowthClubs: [],
      membershipTrend: [{ date: '2024-10-15', count: 999 }],
      divisionRankings: [],
      topPerformingAreas: [],
      totalMembership: 999,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: null, isLoading: false })),
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

// Avoid Recharts in JSDOM.
vi.mock('../../components/MembershipTrendChart', () => ({
  MembershipTrendChart: () => <div data-testid="membership-trend-chart" />,
}))
vi.mock('../../components/YearOverYearComparison', () => ({
  YearOverYearComparison: () => <div data-testid="year-over-year-comparison" />,
}))

function renderHub() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={['/districts/D42']}>
          <Routes>
            <Route
              path="/districts/:districtId"
              element={<DistrictDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('DistrictDetailPage — first-load bytes (#2513)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    observed.length = 0
    localStorageMock.getItem.mockReturnValue(null)
  })
  afterEach(() => cleanup())

  it('holds competitive-awards.json until the trophy case nears the viewport', async () => {
    renderHub()
    await waitFor(() => {
      expect(
        screen.getByRole('navigation', { name: /district subviews/i })
      ).toBeInTheDocument()
    })
    // Let every first-load query settle before asserting the absence.
    await new Promise(r => setTimeout(r, 50))
    expect(fetchCdnCompetitiveAwards).not.toHaveBeenCalled()

    await act(async () => fireNear('trophy-case-slot'))
    await waitFor(() => expect(fetchCdnCompetitiveAwards).toHaveBeenCalled())
  })
})
