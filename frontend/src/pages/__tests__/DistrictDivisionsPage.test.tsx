/**
 * District Divisions Page — Phase 3 of the District IA migration (#571).
 *
 * Verifies the new route `/district/:districtId/divisions` and the legacy
 * `?tab=divisions` redirect introduced in this phase.
 */

import React, { Suspense } from 'react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import DistrictDetailPage from '../DistrictDetailPage'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
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

vi.mock('../../hooks/useAggregatedAnalytics', () => ({
  useAggregatedAnalytics: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      dates: ['2025-07-15', '2025-07-01'],
      dateRange: { startDate: '2025-07-01', endDate: '2025-07-15' },
    },
    isLoading: false,
  })),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({
    data: {
      asOfDate: '2025-07-15',
      divisions: [
        {
          divisionId: 'A',
          divisionName: 'Division A',
          areas: [],
          totalClubs: 5,
          paidClubs: 4,
          distinguishedClubs: 2,
          membership: 100,
          clubBase: 5,
        },
      ],
    },
    isLoading: false,
  })),
}))

vi.mock('../../hooks/usePerformanceTargets', () => ({
  usePerformanceTargets: vi.fn(() => ({ data: null, isLoading: false })),
}))

vi.mock('../../hooks/usePaymentsTrend', () => ({
  usePaymentsTrend: vi.fn(() => ({ data: null, isLoading: false })),
}))

vi.mock('../../hooks/useTimeSeries', () => ({
  useTimeSeries: vi.fn(() => ({ data: null, isLoading: false })),
}))

vi.mock('../../hooks/useCompetitiveAwards', () => ({
  useCompetitiveAwards: vi.fn(() => ({ data: null, isLoading: false })),
}))

// #2405 — the page's remaining CDN reads, stubbed so no request leaves the
// test: the PY dates index (ProgramYearProvider), the latest-date manifest and
// the undated rankings (the hub's rank chip). The rankings carry no row for
// D61, so the chip stays empty, as the divisions assertions assume.
vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2025-07-01', '2025-07-15'],
    count: 2,
    generatedAt: '2025-07-16T00:00:00Z',
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2025-07-15',
    generatedAt: '2025-07-16T00:00:00Z',
  }),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2025-07-15'),
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2025-07-15',
    generatedAt: '2025-07-16T00:00:00Z',
  }),
}))

vi.mock('../../components/LazyCharts', () => ({
  LazyMembershipTrendChart: () => null,
  LazyMembershipPaymentsChart: () => null,
  LazyYearOverYearComparison: () => null,
}))

vi.mock('../../components/GlobalRankingsTab', () => ({ default: () => null }))

vi.mock('../../components/DivisionPerformanceCards', () => ({
  DivisionPerformanceCards: (props: {
    isLoading?: boolean
    countsPending?: boolean
  }) => (
    <div
      data-testid="division-performance-cards"
      data-loading={String(props.isLoading === true)}
      data-counts-pending={String(props.countsPending === true)}
    >
      division cards
    </div>
  ),
}))

vi.mock('../../components/DivisionAreaRecognitionPanel', () => ({
  DivisionAreaRecognitionPanel: (props: { isLoading?: boolean }) => (
    <div
      data-testid="division-area-recognition-panel"
      data-loading={String(props.isLoading === true)}
    >
      area recognition
    </div>
  ),
}))

vi.mock('../../components/DistinguishedProgramCriteriaExplainer', () => ({
  default: () => (
    <div data-testid="ddp-criteria-explainer">criteria explainer</div>
  ),
}))

const DistrictDivisionsPage = React.lazy(
  () => import('../DistrictDivisionsPage')
)

// Compile the page's module graph (and its on-demand chunks) once, up front:
// otherwise the first test's 1 s findBy window measures Vite's cold
// transform of the whole graph, not the page; on a slow CI runner that alone
// overruns the window (#2248; same pattern as DistrictMapPage.test.tsx).
beforeAll(async () => {
  await import('../DistrictDivisionsPage')
})

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const routes: RouteObject[] = [
    { path: '/district/:districtId', element: <DistrictDetailPage /> },
    {
      path: '/district/:districtId/divisions',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictDivisionsPage />
        </Suspense>
      ),
    },
  ]

  const router = createMemoryRouter(routes, { initialEntries: [initialUrl] })

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <RouterProvider router={router} />
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
  return { ...utils, router }
}

describe('DistrictDivisionsPage (#571 — Phase 3)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('renders the divisions panels at /district/:districtId/divisions', async () => {
    renderAt('/district/61/divisions')

    expect(
      await screen.findByTestId('division-performance-cards')
    ).toBeInTheDocument()
    expect(screen.getByTestId('ddp-criteria-explainer')).toBeInTheDocument()
    expect(
      screen.getByTestId('division-area-recognition-panel')
    ).toBeInTheDocument()
  })

  // #1901, #2580: the confirmed/qualifying-today split comes from the district
  // analytics read. The cards render from the statistics alone and do not wait
  // for it; the extra arrives into a reserved slot.
  it('does not hold the division cards for the analytics read, only their count-driven values', async () => {
    const pending = {
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDistrictAnalytics>
    const fallback = vi.mocked(useDistrictAnalytics).getMockImplementation()
    vi.mocked(useDistrictAnalytics).mockImplementation(() => pending)
    try {
      renderAt('/district/61/divisions')
      const cards = await screen.findByTestId('division-performance-cards')
      expect(cards).toHaveAttribute('data-loading', 'false')
      // ...but it holds back the values the counts decide (no first paint on
      // the qualifying-today basis), and so does the recognition panel.
      expect(cards).toHaveAttribute('data-counts-pending', 'true')
      expect(
        screen.getByTestId('division-area-recognition-panel')
      ).toHaveAttribute('data-loading', 'true')
    } finally {
      if (fallback) vi.mocked(useDistrictAnalytics).mockImplementation(fallback)
    }
  })

  it('shows the snapshot basis once the analytics read has failed', async () => {
    const failed = {
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDistrictAnalytics>
    const fallback = vi.mocked(useDistrictAnalytics).getMockImplementation()
    vi.mocked(useDistrictAnalytics).mockImplementation(() => failed)
    try {
      renderAt('/district/61/divisions')
      const cards = await screen.findByTestId('division-performance-cards')
      expect(cards).toHaveAttribute('data-counts-pending', 'false')
    } finally {
      if (fallback) vi.mocked(useDistrictAnalytics).mockImplementation(fallback)
    }
  })

  it('self-titles the document per route (#780)', async () => {
    renderAt('/district/61/divisions')
    await waitFor(() =>
      expect(document.title).toBe('District 61 Divisions — Toast Stats')
    )
  })

  it('renders the District section subnav with Divisions active (#678)', async () => {
    renderAt('/district/61/divisions')
    await screen.findByTestId('division-performance-cards')

    expect(
      screen.getByRole('navigation', { name: 'District sections' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Divisions', current: 'page' })
    ).toBeInTheDocument()
  })

  it('has no breadcrumb: the Overview tab is the way back (#577, #2646)', async () => {
    renderAt('/district/61/divisions')
    await screen.findByTestId('division-performance-cards')

    expect(screen.queryByTestId('subpage-breadcrumb')).toBeNull()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/district/61'
    )
    expect(
      screen.queryByRole('button', { name: /Back to District 61/i })
    ).not.toBeInTheDocument()
  })

  it('redirects /district/:id?tab=divisions to /district/:id/divisions', async () => {
    const { router } = renderAt('/district/61?tab=divisions')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/district/61/divisions')
    })
  })

  /* #1837 — the statistics query is disabled until the per-district date
   * index resolves, and a disabled query reports `isLoading: false`, so the
   * `isLoading && <Skeleton/>` arm painted nothing for that window: the static
   * DDP criteria sat at the top and the division list landed above it
   * (CLS 0.20 at 375px). */
  it('reserves the division cards slot while the date index is still in flight', async () => {
    const datesMock = vi.mocked(useDistrictCachedDates)
    const statsMock = vi.mocked(useDistrictStatistics)
    const restoreDates = datesMock.getMockImplementation()
    const restoreStats = statsMock.getMockImplementation()
    datesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isPending: true,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    statsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useDistrictStatistics>)
    try {
      renderAt('/district/61/divisions')
      const cards = await screen.findByTestId('division-performance-cards')
      expect(cards).toHaveAttribute('data-loading', 'true')
      expect(
        screen.getByRole('status', { name: 'Loading table' })
      ).toBeInTheDocument()
    } finally {
      if (restoreDates) datesMock.mockImplementation(restoreDates)
      if (restoreStats) statsMock.mockImplementation(restoreStats)
    }
  })
})
