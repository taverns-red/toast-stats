/**
 * District Grid Page (#1230, epic #1228) — the at-a-glance "Chiclet / LEO board":
 * one colour-coded tile per club, grouped Division → Area, on `/district/:id/grid`.
 *
 * Page-mount test → lives in pages/__tests__ per R22 (must not run in the unit
 * project). Verifies grouping, the URL-synced health/tier colour toggle (clamped
 * at parse — L124/144), the aria-pressed toggle model (NOT tabs — L128), and
 * suspended/empty handling.
 */
import React, { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

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
      dates: ['2026-06-01', '2026-05-15'],
      dateRange: { startDate: '2025-07-01', endDate: '2026-06-01' },
    },
    isLoading: false,
  })),
}))

// Keep the heavy date/program-year chrome out of the grid-logic assertions.
vi.mock('../../components/DistrictDetailHeader', () => ({
  DistrictDetailHeader: () => <div data-testid="district-header" />,
}))

const club = (overrides: Partial<ClubTrend>): ClubTrend =>
  ({
    clubId: '0',
    clubName: 'Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '1',
    areaName: 'Area 1',
    membershipTrend: [{ date: '2026-06-01', count: 20 }],
    dcpGoalsTrend: [{ date: '2026-06-01', goalsAchieved: 6 }],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'Distinguished',
    ...overrides,
  }) as ClubTrend

const CLUBS: ClubTrend[] = [
  club({
    clubId: '101',
    clubName: 'Alpha Speakers',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: 'A1',
    areaName: 'Area 1',
    currentStatus: 'thriving',
    distinguishedLevel: 'President',
  }),
  club({
    clubId: '102',
    clubName: 'Beta Orators',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: 'A2',
    areaName: 'Area 2',
    currentStatus: 'vulnerable',
    distinguishedLevel: 'NotDistinguished',
  }),
  club({
    clubId: '103',
    clubName: 'Gamma Voices',
    divisionId: 'B',
    divisionName: 'Division B',
    areaId: 'B5',
    areaName: 'Area 5',
    currentStatus: 'intervention-required',
    distinguishedLevel: 'NotDistinguished',
    clubStatus: 'Suspended',
  }),
]

let mockClubs: ClubTrend[] = CLUBS

vi.mock('../../hooks/useDistrictAnalytics', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../hooks/useDistrictAnalytics')>()
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: { allClubs: mockClubs },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
  }
})

const DistrictGridPage = React.lazy(() => import('../DistrictGridPage'))

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/grid',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictGridPage />
        </Suspense>
      ),
    },
    { path: '/district/:districtId/club/:clubId', element: <div>club</div> },
  ]
  const router = createMemoryRouter(routes, { initialEntries: [initialUrl] })
  return render(
    <QueryClientProvider client={queryClient}>
      <DarkModeProvider>
        <ProgramYearProvider>
          <RouterProvider router={router} />
        </ProgramYearProvider>
      </DarkModeProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  mockClubs = CLUBS
})

describe('DistrictGridPage — grouping', () => {
  it('renders every club as a tile grouped under Division → Area', async () => {
    renderAt('/district/61/grid')
    await waitFor(() =>
      expect(screen.getByText('Alpha Speakers')).toBeInTheDocument()
    )
    // Division group headers
    expect(screen.getByText('Division A')).toBeInTheDocument()
    expect(screen.getByText('Division B')).toBeInTheDocument()
    // Area sub-headers
    expect(screen.getByText(/Area 1/)).toBeInTheDocument()
    expect(screen.getByText(/Area 2/)).toBeInTheDocument()
    // Every club is a real link to its detail route
    expect(
      screen.getByRole('link', { name: /Alpha Speakers/ })
    ).toHaveAttribute('href', '/district/61/club/101')
    expect(screen.getByRole('link', { name: /Beta Orators/ })).toHaveAttribute(
      'href',
      '/district/61/club/102'
    )
    expect(screen.getByRole('link', { name: /Gamma Voices/ })).toHaveAttribute(
      'href',
      '/district/61/club/103'
    )
  })

  it('shows an empty state when the district has no clubs', async () => {
    mockClubs = []
    renderAt('/district/61/grid')
    await waitFor(() =>
      expect(screen.getByText(/no clubs/i)).toBeInTheDocument()
    )
  })
})

describe('DistrictGridPage — colour mode (URL-synced, clamped at parse)', () => {
  it('defaults to health colouring', async () => {
    renderAt('/district/61/grid')
    const tile = await screen.findByRole('link', { name: /Alpha Speakers/ })
    expect(tile.className).toContain('club-grid-tile--thriving')
    expect(tile.getAttribute('aria-label')).toContain('Thriving')
  })

  it('colours by Distinguished tier when ?color=tier', async () => {
    renderAt('/district/61/grid?color=tier')
    const tile = await screen.findByRole('link', { name: /Alpha Speakers/ })
    expect(tile.className).toContain('club-grid-tile--tier-presidents')
    expect(tile.getAttribute('aria-label')).toContain("President's")
  })

  it('clamps an unknown ?color value to health (L124/144)', async () => {
    renderAt('/district/61/grid?color=garbage')
    const tile = await screen.findByRole('link', { name: /Alpha Speakers/ })
    expect(tile.className).toContain('club-grid-tile--thriving')
  })
})

describe('DistrictGridPage — colour toggle is aria-pressed, not tabs (L128)', () => {
  it('exposes two toggle buttons, not a tablist', async () => {
    renderAt('/district/61/grid')
    await screen.findByRole('link', { name: /Alpha Speakers/ })
    // No tab semantics — the toggle filters the same view, it does not swap panels
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    const health = screen.getByRole('button', { name: /health/i })
    const tier = screen.getByRole('button', { name: /tier/i })
    expect(health).toHaveAttribute('aria-pressed', 'true')
    expect(tier).toHaveAttribute('aria-pressed', 'false')
  })

  it('reflects the active mode in aria-pressed when ?color=tier', async () => {
    renderAt('/district/61/grid?color=tier')
    await screen.findByRole('link', { name: /Alpha Speakers/ })
    expect(screen.getByRole('button', { name: /tier/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

describe('DistrictGridPage — legend + suspended handling', () => {
  it('renders a legend reflecting the active colour mode', async () => {
    renderAt('/district/61/grid')
    await screen.findByRole('link', { name: /Alpha Speakers/ })
    const legend = screen.getByRole('group', { name: /legend/i })
    expect(within(legend).getByText(/Thriving/)).toBeInTheDocument()
    expect(within(legend).getByText(/Vulnerable/)).toBeInTheDocument()
    expect(within(legend).getByText(/Intervention/)).toBeInTheDocument()
  })

  it('marks a suspended club distinctly', async () => {
    renderAt('/district/61/grid')
    const tile = await screen.findByRole('link', { name: /Gamma Voices/ })
    expect(tile.className).toContain('club-grid-tile--suspended')
    expect(tile.getAttribute('aria-label')).toContain('Suspended')
  })
})
