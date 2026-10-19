/**
 * District Education page (#1793, epic #1781) — `/district/:id/education`.
 *
 * A real routed subpage (ADR-005): the section nav marks it current, the PY
 * and date come from the URL-synced page controls and are handed down (R3),
 * and the education-award leaderboards live here now (moved from Analytics).
 */
import React, { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import recordedD61 from '../../__tests__/fixtures/d61-education-reports.recorded.json'
import recordedClubs from '../../__tests__/fixtures/d61-education-clubs.recorded.json'

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
})
