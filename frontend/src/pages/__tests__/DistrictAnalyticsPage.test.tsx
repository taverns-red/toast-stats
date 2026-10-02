/**
 * District Analytics Page — Sprint 6 of the District IA epic (#680, ADR-005 §1/§2).
 *
 * Top-growth / top-DCP-achiever lists (and the education-levels rollup) moved
 * off the Overview hub onto their own deep-linkable route
 * `/district/:districtId/analytics`.
 */

import React, { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
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
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      dates: ['2024-10-15', '2024-10-01'],
      dateRange: { startDate: '2024-10-01', endDate: '2024-10-15' },
    },
    isLoading: false,
  })),
}))

const topGrowthProps: Array<{
  topGrowthClubs: unknown[]
  topDCPClubs?: unknown[]
}> = []

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: {
      allClubs: [
        {
          clubId: 'c1',
          clubName: 'Alpha',
          dcpGoalsTrend: [{ goalsAchieved: 9 }],
          distinguishedLevel: 'Select',
        },
        {
          clubId: 'c2',
          clubName: 'Beta',
          dcpGoalsTrend: [{ goalsAchieved: 5 }],
        },
      ],
      topGrowthClubs: [{ clubId: 'c1', clubName: 'Alpha', growth: 12 }],
      distinguishedClubs: { total: 10 },
      totalMembership: 1000,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({
    data: { asOfDate: '2024-10-15', divisions: [] },
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

vi.mock('../../hooks/useCompetitiveAwards', () => ({
  useCompetitiveAwards: vi.fn(() => ({ data: null, isLoading: false })),
}))

vi.mock('../../components/TopGrowthClubs', () => ({
  TopGrowthClubs: (props: {
    topGrowthClubs: unknown[]
    topDCPClubs?: unknown[]
  }) => {
    topGrowthProps.push(props)
    return (
      <div data-testid="top-growth-clubs">
        <span data-testid="growth-count">{props.topGrowthClubs.length}</span>
        <span data-testid="dcp-count">{props.topDCPClubs?.length ?? 0}</span>
      </div>
    )
  },
}))

vi.mock('../../components/EducationLevelsCard', () => ({
  EducationLevelsCard: () => <div data-testid="education-levels-card" />,
}))

const leaderboardProps: Array<{
  districtId: string
  isPriorProgramYear: boolean
  rankings: {
    awardsPerBase: { available: boolean; ranked: Array<{ clubId: string }> }
    membersWithAward: { available: boolean }
  }
}> = []

vi.mock('../../components/EducationAwardsLeaderboard', () => ({
  EducationAwardsLeaderboard: (props: (typeof leaderboardProps)[number]) => {
    leaderboardProps.push(props)
    return <div data-testid="education-awards-leaderboard" />
  },
}))

const DistrictAnalyticsPage = React.lazy(
  () => import('../DistrictAnalyticsPage')
)

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    { path: '/district/:districtId', element: <DistrictDetailPage /> },
    {
      path: '/district/:districtId/analytics',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictAnalyticsPage />
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

describe('DistrictAnalyticsPage (#680 — ADR-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    topGrowthProps.length = 0
    leaderboardProps.length = 0
  })
  afterEach(() => cleanup())

  it('renders Top Growth / Top DCP and the education-levels rollup', async () => {
    renderAt('/district/61/analytics')
    expect(await screen.findByTestId('top-growth-clubs')).toBeInTheDocument()
    expect(screen.getByTestId('education-levels-card')).toBeInTheDocument()
  })

  it('self-titles the document per route (#780)', async () => {
    renderAt('/district/61/analytics')
    await waitFor(() =>
      expect(document.title).toBe('District 61 Analytics — Toast Stats')
    )
  })

  it('derives the top DCP list from analytics.allClubs (sorted, capped)', async () => {
    renderAt('/district/61/analytics')
    await screen.findByTestId('top-growth-clubs')
    expect(screen.getByTestId('growth-count')).toHaveTextContent('1')
    // Both mocked clubs have a dcpGoalsTrend entry → 2 DCP achievers.
    expect(screen.getByTestId('dcp-count')).toHaveTextContent('2')
  })

  it('renders the section subnav with Analytics active', async () => {
    renderAt('/district/61/analytics')
    await screen.findByTestId('top-growth-clubs')
    expect(
      screen.getByRole('navigation', { name: 'District sections' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Analytics', current: 'page' })
    ).toBeInTheDocument()
  })

  it('shows a back-to-district breadcrumb', async () => {
    renderAt('/district/61/analytics')
    await screen.findByTestId('top-growth-clubs')
    expect(screen.getByRole('link', { name: 'District 61' })).toHaveAttribute(
      'href',
      '/district/61'
    )
  })

  it('redirects /district/:id?tab=analytics to /district/:id/analytics', async () => {
    const { router } = renderAt('/district/61?tab=analytics')
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/district/61/analytics')
    })
  })

  // #1104 — a fetch reject must surface a retryable error state, not silently
  // render an empty page (the old `{analytics ? … : isLoading && <Skeleton/>}`
  // collapsed to nothing on error).
  it('surfaces a retryable error state when the analytics fetch rejects', async () => {
    const refetch = vi.fn()
    vi.mocked(useDistrictAnalytics).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Failed to fetch'),
      refetch,
    } as unknown as ReturnType<typeof useDistrictAnalytics>)

    renderAt('/district/61/analytics')

    const retry = await screen.findByRole('button', {
      name: /retry loading data/i,
    })
    expect(screen.queryByTestId('top-growth-clubs')).not.toBeInTheDocument()
    fireEvent.click(retry)
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  // #1592 — education-award leaderboards, fed by the reports dataset the
  // analytics hook already fetched (no second request).
  it('renders the education award leaderboards from the hook reports dataset', async () => {
    vi.mocked(useDistrictAnalytics).mockReturnValue({
      data: {
        allClubs: [
          {
            clubId: 'c1',
            clubName: 'Alpha',
            divisionId: 'A',
            areaId: '01',
            membershipBase: 10,
            dcpGoalsTrend: [],
          },
          {
            clubId: 'c2',
            clubName: 'Beta',
            divisionId: 'A',
            areaId: '02',
            membershipBase: 20,
            dcpGoalsTrend: [],
          },
        ],
        topGrowthClubs: [],
        districtReports: {
          districtId: '61',
          programYear: '2024-2025',
          generatedAt: '2024-10-15T00:00:00Z',
          sections: {
            educationAchievements: {
              sources: [
                {
                  reportType: 'education-achievements',
                  tableId: 't',
                  asOf: 'October 15, 2024',
                },
              ],
              records: [
                {
                  club: 'c2',
                  division: 'A',
                  area: '02',
                  name: 'Beta',
                  location: 'Town',
                  award: 'PM1',
                  achievementCount: 5,
                },
              ],
            },
          },
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDistrictAnalytics>)

    renderAt('/district/61/analytics')

    expect(
      await screen.findByTestId('education-awards-leaderboard')
    ).toBeInTheDocument()
    const props = leaderboardProps.at(-1)!
    expect(props.districtId).toBe('61')
    expect(props.rankings.awardsPerBase.available).toBe(true)
    expect(props.rankings.awardsPerBase.ranked.map(e => e.clubId)).toEqual([
      'c2',
      'c1',
    ])
    expect(props.rankings.membersWithAward.available).toBe(false)
  })

  // Unavailable-message copy depends on current vs prior PY — the page passes
  // it down from its own PY selection (R3), never from reports.programYear.
  it('flags the newest program year with data as current (not prior)', async () => {
    renderAt('/district/61/analytics')
    await screen.findByTestId('education-awards-leaderboard')
    expect(leaderboardProps.at(-1)!.isPriorProgramYear).toBe(false)
  })

  it('flags an older selected program year as prior', async () => {
    vi.mocked(useDistrictCachedDates).mockReturnValue({
      data: {
        dates: ['2024-10-15', '2024-06-30'],
        dateRange: { startDate: '2024-06-30', endDate: '2024-10-15' },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)

    renderAt('/district/61/analytics?py=2023')
    await screen.findByTestId('education-awards-leaderboard')
    expect(leaderboardProps.at(-1)!.isPriorProgramYear).toBe(true)
  })
})
