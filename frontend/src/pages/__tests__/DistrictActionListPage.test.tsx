/**
 * District Action List Page (#1231, epic #1228 Sprint 3).
 *
 * Verifies the `/district/:districtId/action-list` route renders the three
 * action sections from existing predicates/visit data, that scope filtering is
 * URL-synced, that links resolve to canonical club/area pages, and that each
 * section has an empty state.
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
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type {
  AreaPerformance,
  DivisionPerformance,
} from '../../utils/divisionStatus'

function makeClub(overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: 'c1',
    clubName: 'Club One',
    divisionId: 'A',
    areaId: 'A1',
    areaName: 'Area A1',
    membershipTrend: [
      { date: '2025-07-01', count: 18 },
      { date: '2025-07-15', count: 18 },
    ],
    dcpGoalsTrend: [
      { date: '2025-07-01', goalsAchieved: 0 },
      { date: '2025-07-15', goalsAchieved: 4 },
    ],
    membershipBase: 18,
    aprilRenewals: null,
    cspSubmitted: true,
    currentStatus: 'thriving',
    distinguishedLevel: 'NotDistinguished',
    ...overrides,
  } as ClubTrend
}

// A club the predicate flags (members gap 2, goals 4, CSP submitted).
const closeClub = makeClub({
  clubId: 'close-1',
  clubName: 'Rising Club',
  divisionId: 'A',
  areaId: 'A1',
})

const interventionClub = makeClub({
  clubId: 'int-1',
  clubName: 'Struggling Club',
  divisionId: 'B',
  areaId: 'B2',
  currentStatus: 'intervention-required',
  // Only 1 DCP goal, so it is NOT also close-to-Distinguished — it must appear
  // solely in the intervention section.
  dcpGoalsTrend: [{ date: '2025-07-15', goalsAchieved: 1 }],
})

function makeArea(overrides: Partial<AreaPerformance>): AreaPerformance {
  return {
    areaId: 'A1',
    currentRound: 1,
    clubsMissingCurrentRoundVisit: [],
    clubsMissingCurrentRoundVisitIneligible: [],
    recognitionState: {
      level: 'distinguished',
      status: 'provisional',
      pendingRounds: [{ round: 1, deadline: '2025-11-30' }],
      failureReason: null,
    },
    ...overrides,
  } as AreaPerformance
}

const divisionPerf: DivisionPerformance[] = [
  {
    divisionId: 'A',
    areas: [
      makeArea({
        areaId: 'A1',
        currentRound: 1,
        clubsMissingCurrentRoundVisit: [
          { clubNumber: '900', clubName: 'Unvisited Club' },
        ],
      }),
    ],
  } as DivisionPerformance,
  {
    divisionId: 'B',
    areas: [makeArea({ areaId: 'B2', clubsMissingCurrentRoundVisit: [] })],
  } as DivisionPerformance,
]

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
    isLoading: false,
    error: null,
  })),
}))

const analyticsData = {
  allClubs: [closeClub, interventionClub],
  interventionRequiredClubs: [interventionClub],
}

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: analyticsData,
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
    data: { asOfDate: '2025-07-15' },
    isLoading: false,
  })),
}))

vi.mock('../../utils/extractDivisionPerformance', () => ({
  extractDivisionPerformance: vi.fn(() => divisionPerf),
}))

const DistrictActionListPage = React.lazy(
  () => import('../DistrictActionListPage')
)

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/action-list',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictActionListPage />
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

describe('DistrictActionListPage (#1231)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('renders the three action sections at /district/:id/action-list', async () => {
    renderAt('/district/61/action-list')
    expect(await screen.findByTestId('action-list-page')).toBeInTheDocument()
    expect(screen.getByTestId('section-close')).toBeInTheDocument()
    expect(screen.getByTestId('section-visits')).toBeInTheDocument()
    expect(screen.getByTestId('section-intervention')).toBeInTheDocument()
  })

  it('shows the close-to-Distinguished club with its concrete gap, linking to the club page', async () => {
    renderAt('/district/61/action-list')
    const link = await screen.findByRole('link', { name: 'Rising Club' })
    expect(link).toHaveAttribute('href', '/district/61/club/close-1')
    // gap reused from the projection: members gap 2, goals gap 1
    expect(
      screen.getByText(/needs 2 members \+ 1 DCP goal/)
    ).toBeInTheDocument()
  })

  it('lists the area missing club visits with round + deadline, linking to the area page', async () => {
    renderAt('/district/61/action-list')
    const link = await screen.findByRole('link', { name: 'Area A1' })
    expect(link).toHaveAttribute('href', '/district/61/division/A/area/A1')
    expect(
      screen.getByText(/1 club unvisited · Round 1, due 2025-11-30/)
    ).toBeInTheDocument()
  })

  it('lists intervention-required clubs linking to the club page', async () => {
    renderAt('/district/61/action-list')
    const link = await screen.findByRole('link', { name: 'Struggling Club' })
    expect(link).toHaveAttribute('href', '/district/61/club/int-1')
  })

  it('URL-syncs scope: ?division=B drops the division-A items', async () => {
    renderAt('/district/61/action-list?division=B')
    await screen.findByTestId('action-list-page')
    // Division A close club + visit gap are filtered out; B intervention stays.
    expect(
      screen.queryByRole('link', { name: 'Rising Club' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Area A1' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Struggling Club' })
    ).toBeInTheDocument()
  })

  it('renders empty states for every section when the scope matches nothing', async () => {
    renderAt('/district/61/action-list?division=ZZ')
    await screen.findByTestId('action-list-page')
    expect(
      screen.getByText(/No clubs are within reach of Distinguished/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Every area has completed the current round/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No clubs are flagged intervention-required/)
    ).toBeInTheDocument()
  })

  it('marks the Action List subnav item active and self-titles the document', async () => {
    renderAt('/district/61/action-list')
    await screen.findByTestId('action-list-page')
    expect(
      screen.getByRole('link', { name: 'Action List', current: 'page' })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(document.title).toBe('District 61 Action List — Toast Stats')
    )
  })
})
