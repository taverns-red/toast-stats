/**
 * PY-selector tests for AreaPage (#1302, epic #1298 Sprint 3).
 *
 * AreaPage historically hardcoded "latest snapshot only" (undefined dates).
 * It must now expose the shared DataControlsBar PY chip, thread the selected
 * PY's effective end date into its district-analytics + snapshot queries (R3),
 * and honor a `?py=` deep link.
 */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import AreaPage from '../AreaPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      districtId: '61',
      dates: ['2025-08-01', '2026-05-01', '2026-08-01'],
      count: 3,
      dateRange: { startDate: '2025-08-01', endDate: '2026-08-01' },
    },
  })),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2025-08-01', '2026-05-01', '2026-08-01'],
    count: 3,
    generatedAt: '2026-08-02T00:00:00Z',
  }),
  // The freshness pill's global as-of source (#1321) — the page reads it via
  // useLatestAsOfDate now that the per-district `asOfDate` phantom is gone.
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2026-08-05',
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-08-01',
  }),
}))

const SNAPSHOT = {
  asOfDate: '2026-03-15',
  divisionPerformance: [
    {
      Division: 'A',
      Area: '10',
      'Club Number': '123456',
      'Club Name': 'Ottawa Club',
      'Division Club Base': '3',
      'Area Club Base': '1',
      'Nov Visit award': '1',
      'May Visit award': '0',
    },
  ],
  clubPerformance: [
    {
      'Club Number': '123456',
      'Club Name': 'Ottawa Club',
      'Club Status': 'Active',
      'Club Distinguished Status': 'Select Distinguished',
    },
  ],
}

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({
    data: SNAPSHOT,
    isLoading: false,
    error: null,
  })),
}))

const CLUB: ClubTrend = {
  clubId: '123456',
  clubName: 'Ottawa Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '10',
  areaName: 'Area 10',
  distinguishedLevel: 'Select',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-15', count: 25 }],
  dcpGoalsTrend: [{ date: '2026-03-15', goalsAchieved: 8 }],
}

vi.mock('../../hooks/useDistrictAnalytics', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useDistrictAnalytics')
  >('../../hooks/useDistrictAnalytics')
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: { allClubs: [CLUB] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
  }
})

const mockedAnalytics = vi.mocked(useDistrictAnalytics)

const LocationProbe = () => {
  const { search } = useLocation()
  return <div data-testid="loc-search">{search}</div>
}

afterEach(() => cleanup())
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

const renderAt = (url: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <LocationProbe />
          <Routes>
            <Route
              path="/district/:districtId/division/:divId/area/:areaId"
              element={<AreaPage />}
            />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const lastAnalyticsEndDate = () => {
  const calls = mockedAnalytics.mock.calls
  return calls[calls.length - 1]?.[2]
}

describe('AreaPage — program year selector (#1302)', () => {
  it('renders the PY selector chip', async () => {
    renderAt('/district/61/division/A/area/10')
    expect(await screen.findByTestId('py-chip')).toBeInTheDocument()
  })

  it('honors a ?py= deep link and fetches that PY latest snapshot', async () => {
    renderAt('/district/61/division/A/area/10?py=2025')
    await screen.findByTestId('py-chip')
    expect(screen.getByTestId('py-chip-select')).toHaveValue('2025')
    await waitFor(() => expect(lastAnalyticsEndDate()).toBe('2026-05-01'))
  })

  it('re-queries when the PY selector changes', async () => {
    renderAt('/district/61/division/A/area/10')
    await screen.findByTestId('py-chip')
    await waitFor(() => expect(lastAnalyticsEndDate()).toBe('2026-08-01'))

    await userEvent.selectOptions(screen.getByTestId('py-chip-select'), '2025')
    await waitFor(() => expect(lastAnalyticsEndDate()).toBe('2026-05-01'))
    await waitFor(() =>
      expect(screen.getByTestId('loc-search').textContent).toContain('py=2025')
    )
  })
})
