/**
 * KPI strip must not render before its performance targets settle (#1685).
 *
 * The strip's data joins two independent CDN reads: the district analytics
 * file and the performance-targets file (ranks + tier targets). The strip used
 * to render as soon as analytics landed. When the targets file landed a frame
 * or more later, every card first rendered without its rank line and bullet
 * bar (`targets: null`, `NULL_RANKINGS`) — an 88px-shorter strip at 1350px —
 * then grew back when the targets arrived. Two shifts of the whole Overview
 * stack, ~0.06 CLS, enough to breach the 0.1 budget intermittently in CI
 * (`e2e/district-overview-cls.smoke.ts`) while passing on a fast local load
 * where both reads resolve in one frame.
 *
 * Contract: while the targets query is pending, the strip holds its full-size
 * skeleton. Once it settles — data or not (a missing/failed targets file
 * falls back to the analytics-inline targets) — the loaded strip renders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, render, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'
import DistrictDetailPage from '../DistrictDetailPage'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { usePerformanceTargets } from '../../hooks/usePerformanceTargets'

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
  usePerformanceTargets: vi.fn(),
}))

vi.mock('../../hooks/useCompetitiveAwards', () => ({
  useCompetitiveAwards: vi.fn(() => ({ data: null, isLoading: false })),
}))

const mockedTargets = vi.mocked(usePerformanceTargets)

const RANKS = {
  worldRank: 12,
  worldPercentile: 90,
  regionRank: 2,
  totalDistricts: 128,
  totalInRegion: 14,
  region: '08',
}
const TARGETS = {
  distinguished: 100,
  select: 105,
  presidents: 110,
  smedley: 115,
}
const LOADED_TARGETS = {
  paidClubs: { current: 101, targets: TARGETS, rankings: RANKS },
  membershipPayments: { current: 2500, targets: TARGETS, rankings: RANKS },
  distinguishedClubs: { current: 50, targets: TARGETS, rankings: RANKS },
}

type TargetsResult = ReturnType<typeof usePerformanceTargets>

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

const loadedStrip = () =>
  document.querySelector(
    'section.district-kpi-strip:not(.district-kpi-strip--loading)'
  )

describe('DistrictDetailPage — KPI strip waits for performance targets (#1685)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })
  afterEach(() => cleanup())

  it('holds the skeleton while analytics has landed but targets are pending', async () => {
    mockedTargets.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as TargetsResult)
    renderHub()
    await waitFor(() => {
      expect(
        screen.getByRole('navigation', { name: /district subviews/i })
      ).toBeInTheDocument()
    })
    expect(
      screen.getByTestId('district-kpi-strip-skeleton')
    ).toBeInTheDocument()
    expect(loadedStrip()).toBeNull()
  })

  it('renders the loaded strip with ranks and bullet bars once targets land', async () => {
    mockedTargets.mockReturnValue({
      data: LOADED_TARGETS,
      isLoading: false,
    } as unknown as TargetsResult)
    renderHub()
    await waitFor(() => expect(loadedStrip()).not.toBeNull())
    expect(
      screen.queryByTestId('district-kpi-strip-skeleton')
    ).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('targets-unavailable')).toHaveLength(0)
  })

  it('still renders the strip when the targets read settles empty (no endless skeleton)', async () => {
    mockedTargets.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as TargetsResult)
    renderHub()
    await waitFor(() => expect(loadedStrip()).not.toBeNull())
    expect(
      screen.queryByTestId('district-kpi-strip-skeleton')
    ).not.toBeInTheDocument()
  })
})
