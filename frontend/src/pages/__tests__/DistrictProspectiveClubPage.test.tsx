/**
 * District prospective club page (#2303) —
 * `/district/:id/growth/prospective/:clubId`. A real routed subpage under
 * Club Growth (ADR-005): deep-linkable per club, Growth current in the section
 * nav, the breadcrumb and a back link lead to the funnel, and the date comes
 * from the URL-synced page controls, handed down (R3). Rows are the recorded
 * prod fixture (D84, 2026-10-27), scrubbed.
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
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import recorded from '../../__tests__/fixtures/prospective-club-page.recorded.json'

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '84', name: '84' }] },
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      dates: ['2026-10-27', '2026-10-20', '2026-06-30'],
      dateRange: { startDate: '2026-06-30', endDate: '2026-10-27' },
    },
    isLoading: false,
  })),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
}))

const analytics = {
  districtId: '84',
  allClubs: [{ clubId: '1234567' }],
  prospectiveClubs: recorded.d84_findAClub,
  districtReports: recorded.d84_reports,
}

const DistrictProspectiveClubPage = React.lazy(
  () => import('../DistrictProspectiveClubPage')
)

beforeAll(async () => {
  await import('../DistrictProspectiveClubPage')
})

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/growth/prospective/:clubId',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictProspectiveClubPage />
        </Suspense>
      ),
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: [initialUrl] })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <RouterProvider router={router} />
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('DistrictProspectiveClubPage (#2303)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDistrictAnalytics).mockReturnValue({
      data: analytics,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useDistrictAnalytics>)
  })
  afterEach(() => cleanup())

  it('renders one prospective club under Growth, deep-linked by id', async () => {
    renderAt('/district/84/growth/prospective/28679702?py=2026&date=2026-10-27')
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Prospective Club 84-3',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: /charter checklist/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Growth', current: 'page' })
    ).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs).getByRole('link', { name: 'Growth' }).getAttribute('href')
    ).toBe('/district/84/growth?py=2026&date=2026-10-27')
    expect(crumbs).toHaveTextContent('Prospective Club 84-3')
  })

  it('reads the analytics for the date in the page controls (R3)', async () => {
    renderAt('/district/84/growth/prospective/28679702?py=2026&date=2026-10-20')
    await screen.findByRole('heading', { level: 2 })
    expect(useDistrictAnalytics).toHaveBeenCalledWith(
      '84',
      '2026-07-01',
      '2026-10-20'
    )
  })

  it('never renders the report location, website or meeting times', async () => {
    const { container } = renderAt(
      '/district/84/growth/prospective/28679702?py=2026&date=2026-10-27'
    )
    await screen.findByRole('heading', { level: 2 })
    expect(container.textContent).not.toMatch(/LOCATION-TEXT/)
    expect(container.innerHTML).not.toMatch(/WEBSITE/)
    expect(container.textContent).not.toMatch(/MEETING-/)
  })

  it('self-titles the document with the club', async () => {
    renderAt('/district/84/growth/prospective/28679702?py=2026&date=2026-10-27')
    await waitFor(() =>
      expect(document.title).toBe(
        'Prospective Club 84-3 · District 84 — Toast Stats'
      )
    )
  })

  it('says a club off the list is not a prospective club on that date', async () => {
    renderAt('/district/84/growth/prospective/99999999?py=2026&date=2026-10-27')
    expect(
      await screen.findByText(/not a prospective club on Oct 27, 2026/i)
    ).toBeInTheDocument()
  })
})
