/**
 * Division and area entity pages keep their chrome while loading (#1896).
 *
 * Both pages returned a bare `<LoadingSkeleton variant="card" />` instead of
 * the page while the analytics read was in flight, so at 1280px the short
 * loading page put the shell footer on screen and the landed page pushed it
 * off (CLS 0.059 on /district/61/division/A, prod 2.49.0). In the date-index
 * window before that, the analytics query is disabled and reports
 * `isLoading: false` with no data, so the pages flashed their
 * "Could not load …" error state instead (#1837's disabled-query trap).
 *
 * Loading must instead render the page root that reserves the area under the
 * top bar (`.district-detail-page-root`), the page's own heading, and a
 * loading placeholder in the data slots — never the error state.
 */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import DivisionPage from '../DivisionPage'
import AreaPage from '../AreaPage'
import {
  useDistrictAnalytics,
  type ClubTrend,
} from '../../hooks/useDistrictAnalytics'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { useDistrictStatistics } from '../../hooks/useMembershipData'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const DATES = {
  districtId: '61',
  dates: ['2026-05-01', '2026-08-01'],
  count: 2,
  dateRange: { startDate: '2026-05-01', endDate: '2026-08-01' },
}

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-05-01', '2026-08-01'],
    count: 2,
    generatedAt: '2026-08-02T00:00:00Z',
  }),
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2026-08-05',
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-08-01',
  }),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictAnalytics', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useDistrictAnalytics')
  >('../../hooks/useDistrictAnalytics')
  return { ...actual, useDistrictAnalytics: vi.fn() }
})

const CLUB: ClubTrend = {
  clubId: '123456',
  clubName: 'Ottawa Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  distinguishedLevel: 'Select',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-08-01', count: 25 }],
  dcpGoalsTrend: [{ date: '2026-08-01', goalsAchieved: 8 }],
}

const mockedDates = vi.mocked(useDistrictCachedDates)
const mockedAnalytics = vi.mocked(useDistrictAnalytics)
const mockedStatistics = vi.mocked(useDistrictStatistics)

type DatesResult = ReturnType<typeof useDistrictCachedDates>
type AnalyticsResult = ReturnType<typeof useDistrictAnalytics>
type StatisticsResult = ReturnType<typeof useDistrictStatistics>

const datesPending = () =>
  mockedDates.mockReturnValue({
    data: undefined,
    isPending: true,
  } as unknown as DatesResult)
const datesLoaded = () =>
  mockedDates.mockReturnValue({
    data: DATES,
    isPending: false,
  } as unknown as DatesResult)

const analytics = (state: { isLoading: boolean }) =>
  mockedAnalytics.mockReturnValue({
    data: undefined,
    isLoading: state.isLoading,
    error: null,
    refetch: vi.fn(),
  } as unknown as AnalyticsResult)

afterEach(() => cleanup())
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // Default: the snapshot read has nothing yet and is not the subject.
  mockedStatistics.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as unknown as StatisticsResult)
})

const PAGES = [
  {
    name: 'DivisionPage',
    url: '/district/61/division/A',
    path: '/district/:districtId/division/:divId',
    element: <DivisionPage />,
    heading: 'Division A',
    error: /Could not load division/,
  },
  {
    name: 'AreaPage',
    url: '/district/61/division/A/area/01',
    path: '/district/:districtId/division/:divId/area/:areaId',
    element: <AreaPage />,
    heading: 'Area 01',
    error: /Could not load area/,
  },
] as const

const renderPage = (page: (typeof PAGES)[number]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[page.url]}>
          <Routes>
            <Route path={page.path} element={page.element} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe.each(PAGES)('$name loading state (#1896)', page => {
  it('keeps the page chrome while the analytics read is in flight', () => {
    datesLoaded()
    analytics({ isLoading: true })
    const { container } = renderPage(page)

    expect(
      container.querySelector('.district-detail-page-root'),
      'the loading page must reserve the area under the top bar'
    ).not.toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: page.heading })
    ).toBeInTheDocument()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
    expect(screen.queryByText(page.error)).not.toBeInTheDocument()
  })

  it('shows the loading page, not the error, while the dates are pending', () => {
    // The date index is in flight: the analytics query is disabled and
    // reports isLoading false with no data.
    datesPending()
    analytics({ isLoading: false })
    const { container } = renderPage(page)

    expect(screen.queryByText(page.error)).not.toBeInTheDocument()
    expect(container.querySelector('.district-detail-page-root')).not.toBeNull()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })

  it('still shows the error once the dates settle with no data', () => {
    datesLoaded()
    mockedAnalytics.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
      refetch: vi.fn(),
    } as unknown as AnalyticsResult)
    renderPage(page)
    expect(screen.getByText(page.error)).toBeInTheDocument()
  })

  it('holds the clubs skeleton until the snapshot read settles too', () => {
    // Analytics landed, the recognition snapshot has not: rendering the club
    // list now and the taller recognition card later would push the list
    // down (0.25 CLS at 375 on the preview).
    datesLoaded()
    mockedAnalytics.mockReturnValue({
      data: { allClubs: [CLUB] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as AnalyticsResult)
    // The snapshot query is enabled (dates resolved) and in flight.
    mockedStatistics.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as StatisticsResult)
    renderPage(page)

    expect(screen.queryByText('Ottawa Club')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })
})
