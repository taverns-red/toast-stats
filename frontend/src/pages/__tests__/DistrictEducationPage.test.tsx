/**
 * District Education page (#1793, epic #1781) — `/district/:id/education`.
 *
 * A real routed subpage (ADR-005): the section nav marks it current, the PY
 * and date come from the URL-synced page controls and are handed down (R3),
 * and the education-award leaderboards live here now (moved from Analytics).
 */
import React, { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import {
  EducationRollupIndexSchema,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import { useDistricts } from '../../hooks/useDistricts'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import { useEducationRollupIndex } from '../../hooks/useEducationRollup'
import recordedD61 from '../../__tests__/fixtures/d61-education-reports.recorded.json'
import recordedClubs from '../../__tests__/fixtures/d61-education-clubs.recorded.json'
import recordedIndex from '../../__tests__/fixtures/education-rollup-index.recorded.json'
import recordedTrend from '../../__tests__/fixtures/education-rollup-trend-d61-d17.recorded.json'

// The #1801 rollup index (staging, recorded) with the D61 / D17 trend rows
// of the 2026-10-18 index — the multi-year bars' only source (#1807).
const rollupIndex = EducationRollupIndexSchema.parse({
  ...recordedIndex,
  trend: {
    ...recordedIndex.trend,
    districts: {
      ...recordedIndex.trend.districts,
      ...recordedTrend.districts,
    },
  },
})

const d61 = recordedD61 as unknown as DistrictReportsDataset
const clubs = (
  recordedClubs as {
    clubs: Array<{
      clubId: string
      clubName: string
      divisionId: string
      areaId: string
      membershipBase: number
    }>
  }
).clubs.map(c => ({ ...c, dcpGoalsTrend: [] }))

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
      dates: ['2026-10-13', '2026-10-12'],
      dateRange: { startDate: '2026-10-12', endDate: '2026-10-13' },
    },
    isLoading: false,
  })),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
}))

// The any-date CSV fallback (#2159): the raw club-performance snapshot, read
// only when the ledger is absent for the date.
vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: undefined })),
}))
vi.mock('../../hooks/useEducationRollup', () => ({
  useEducationRollupIndex: vi.fn(() => ({ index: null, isLoading: false })),
}))

const csvSnapshot = {
  clubPerformance: [
    { 'Club Number': '1', 'Level 1s': 3, 'Level 2s': 1, 'Level 3s': 0 },
    { 'Club Number': '2', 'Level 1s': 0, 'Level 2s': 0, 'Level 3s': 2 },
    { 'Club Number': '3', 'Level 1s': 0, 'Level 2s': 0, 'Level 3s': 0 },
  ],
}

const viewProps: Array<{ snapshotDate: string; isPriorProgramYear: boolean }> =
  []
vi.mock('../../components/DistrictEducationView', async () => {
  const actual = await vi.importActual<
    typeof import('../../components/DistrictEducationView')
  >('../../components/DistrictEducationView')
  return {
    ...actual,
    DistrictEducationView: (
      props: React.ComponentProps<typeof actual.DistrictEducationView>
    ) => {
      viewProps.push(props)
      return <actual.DistrictEducationView {...props} />
    },
  }
})

const leaderboardProps: Array<{
  districtId: string
  isPriorProgramYear: boolean
  rankings: { awardsPerBase: { available: boolean } }
}> = []
vi.mock('../../components/EducationAwardsLeaderboard', () => ({
  EducationAwardsLeaderboard: (props: (typeof leaderboardProps)[number]) => {
    leaderboardProps.push(props)
    return <div data-testid="education-awards-leaderboard" />
  },
}))

const DistrictEducationPage = React.lazy(
  () => import('../DistrictEducationPage')
)

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/education',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictEducationPage />
        </Suspense>
      ),
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: [initialUrl] })
  render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <RouterProvider router={router} />
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
  return router
}

const analyticsWith = (reports: DistrictReportsDataset | null) =>
  ({
    data: {
      allClubs: clubs,
      topGrowthClubs: [],
      districtReports: reports,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }) as unknown as ReturnType<typeof useDistrictAnalytics>

describe('DistrictEducationPage (#1793)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    viewProps.length = 0
    leaderboardProps.length = 0
    vi.mocked(useDistrictAnalytics).mockReturnValue(analyticsWith(d61))
  })
  afterEach(() => cleanup())

  it('renders the ledger view and the section nav with Education current', async () => {
    renderAt('/district/61/education')
    expect(
      await screen.findByRole('list', { name: /education at a glance/i })
    ).toHaveTextContent(/297/)
    expect(
      screen.getByRole('link', { name: 'Education', current: 'page' })
    ).toBeInTheDocument()
  })

  it('self-titles the document', async () => {
    renderAt('/district/61/education')
    await waitFor(() =>
      expect(document.title).toBe('District 61 Education — Toast Stats')
    )
  })

  it('hands the selected date down as the snapshot date (R3)', async () => {
    renderAt('/district/61/education?date=2026-10-12')
    await screen.findByRole('list', { name: /education at a glance/i })
    expect(viewProps.at(-1)!.snapshotDate).toBe('2026-10-12')
    expect(vi.mocked(useDistrictAnalytics)).toHaveBeenLastCalledWith(
      '61',
      '2026-07-01',
      '2026-10-12'
    )
  })

  it('a dataset for another PY than the one selected is not shown as this year', async () => {
    vi.mocked(useDistrictAnalytics).mockReturnValue(
      analyticsWith({ ...d61, programYear: '2025-2026' })
    )
    renderAt('/district/61/education')
    expect(
      await screen.findByText(/No education report for this date/)
    ).toHaveAttribute('role', 'status')
    expect(
      screen.queryByRole('list', { name: /education at a glance/i })
    ).toBeNull()
  })

  it('carries the two leaderboards, anchored for the Analytics redirect', async () => {
    renderAt('/district/61/education')
    const board = await screen.findByTestId('education-awards-leaderboard')
    expect(board.closest('#leaderboards')).not.toBeNull()
    const props = leaderboardProps.at(-1)!
    expect(props.districtId).toBe('61')
    expect(props.rankings.awardsPerBase.available).toBe(true)
    expect(props.isPriorProgramYear).toBe(false)
  })

  it('flags an older selected program year as prior', async () => {
    vi.mocked(useDistrictCachedDates).mockReturnValue({
      data: {
        dates: ['2026-10-13', '2026-06-30'],
        dateRange: { startDate: '2026-06-30', endDate: '2026-10-13' },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    vi.mocked(useDistrictAnalytics).mockReturnValue(analyticsWith(null))
    renderAt('/district/61/education?py=2025')
    await screen.findByTestId('education-awards-leaderboard')
    expect(leaderboardProps.at(-1)!.isPriorProgramYear).toBe(true)
    expect(viewProps.at(-1)!.isPriorProgramYear).toBe(true)
  })

  describe('club-performance fallback when the ledger is absent (#2159)', () => {
    it('shows the CSV Education Levels card, labelled with its source', async () => {
      vi.mocked(useDistrictAnalytics).mockReturnValue(analyticsWith(null))
      vi.mocked(useDistrictStatistics).mockReturnValue({
        data: csvSnapshot,
      } as unknown as ReturnType<typeof useDistrictStatistics>)
      renderAt('/district/61/education?date=2026-10-12')
      expect(
        await screen.findByText(/No education report for this date/)
      ).toBeInTheDocument()
      const fallback = await screen.findByRole('region', {
        name: /from the club performance report/i,
      })
      expect(fallback).toHaveTextContent(/club performance report/i)
      expect(
        fallback.querySelector('section[aria-label="education levels"]')
      ).not.toBeNull()
      expect(fallback).toHaveTextContent(/6\s*total awards/)
      // Read for the page's own date (R3), divisions-shaped like before.
      expect(vi.mocked(useDistrictStatistics)).toHaveBeenLastCalledWith(
        '61',
        '2026-10-12',
        'divisions'
      )
    })

    it('does not fetch or show it when the ledger is there', async () => {
      vi.mocked(useDistrictStatistics).mockReturnValue({
        data: csvSnapshot,
      } as unknown as ReturnType<typeof useDistrictStatistics>)
      renderAt('/district/61/education')
      await screen.findByRole('list', { name: /education at a glance/i })
      expect(
        screen.queryByRole('region', {
          name: /from the club performance report/i,
        })
      ).toBeNull()
      for (const call of vi.mocked(useDistrictStatistics).mock.calls) {
        expect(call[0]).toBeNull()
      }
    })
  })

  describe('multi-year bars from the rollup index (#1807)', () => {
    const serveIndex = () =>
      vi.mocked(useEducationRollupIndex).mockReturnValue({
        index: rollupIndex,
        isLoading: false,
      })
    const d61Only = {
      data: { districts: [{ id: '61', name: 'District 61' }] },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useDistricts>
    afterEach(() => {
      vi.mocked(useDistricts).mockReturnValue(d61Only)
      vi.mocked(useEducationRollupIndex).mockReturnValue({
        index: null,
        isLoading: false,
      })
    })

    it('shows every program year of the district, the selected one current', async () => {
      serveIndex()
      renderAt('/district/61/education')
      const list = await screen.findByRole('list', {
        name: 'Awards by program year',
      })
      const items = within(list).getAllByRole('listitem')
      expect(items).toHaveLength(24)
      expect(items[0]).toHaveTextContent('2003-04')
      expect(items[0]).toHaveTextContent('733')
      expect(items.at(-1)).toHaveAttribute('aria-current', 'true')
      expect(items.at(-1)).toHaveTextContent('2026-27')
    })

    it('marks the page’s selected PY, not the newest (R3)', async () => {
      serveIndex()
      vi.mocked(useDistrictCachedDates).mockReturnValue({
        data: {
          dates: ['2026-10-13', '2026-06-30'],
          dateRange: { startDate: '2026-06-30', endDate: '2026-10-13' },
        },
        isLoading: false,
      } as unknown as ReturnType<typeof useDistrictCachedDates>)
      vi.mocked(useDistrictAnalytics).mockReturnValue(analyticsWith(null))
      renderAt('/district/61/education?py=2025')
      const list = await screen.findByRole('list', {
        name: 'Awards by program year',
      })
      const current = within(list)
        .getAllByRole('listitem')
        .filter(li => li.getAttribute('aria-current') === 'true')
      expect(current).toHaveLength(1)
      expect(current[0]).toHaveTextContent('2025-26')
    })

    it('reads a year without a ledger as not available and names the gap', async () => {
      serveIndex()
      vi.mocked(useDistricts).mockReturnValue({
        data: { districts: [{ id: '17', name: 'District 17' }] },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useDistricts>)
      renderAt('/district/17/education')
      const list = await screen.findByRole('list', {
        name: 'Awards by program year',
      })
      expect(within(list).getAllByText('Not available')).toHaveLength(5)
      expect(
        screen.getByText(/years this number was not a district are left out/i)
      ).toBeInTheDocument()
    })

    describe('below 768: sparkline-expand (#1793)', () => {
      beforeEach(() => {
        vi.stubGlobal(
          'matchMedia',
          vi.fn().mockImplementation((query: string) => ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
          }))
        )
      })
      afterEach(() => vi.unstubAllGlobals())

      it('heads the sparkline with this PY to date', async () => {
        serveIndex()
        renderAt('/district/61/education')
        const trigger = await screen.findByRole('button', {
          name: 'Expand Awards by program year chart',
        })
        expect(trigger).toHaveTextContent('2026-27: 317 awards to date')
      })

      it('heads it with the page’s selected PY (R3)', async () => {
        serveIndex()
        vi.mocked(useDistrictCachedDates).mockReturnValue({
          data: {
            dates: ['2026-10-13', '2026-06-30'],
            dateRange: { startDate: '2026-06-30', endDate: '2026-10-13' },
          },
          isLoading: false,
        } as unknown as ReturnType<typeof useDistrictCachedDates>)
        vi.mocked(useDistrictAnalytics).mockReturnValue(analyticsWith(null))
        renderAt('/district/61/education?py=2025')
        const trigger = await screen.findByRole('button', {
          name: 'Expand Awards by program year chart',
        })
        expect(trigger).toHaveTextContent('2025-26: 1,246 awards')
        expect(trigger).not.toHaveTextContent('to date')
      })
    })

    it('shows no year bars before the rollup is published', async () => {
      renderAt('/district/61/education')
      await screen.findByRole('list', { name: /education at a glance/i })
      expect(
        screen.queryByRole('list', { name: 'Awards by program year' })
      ).toBeNull()
    })
  })
})
