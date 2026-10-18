/**
 * District Survival page (#1817, epic #1781) — `/district/:id/growth/survival`.
 *
 * A real routed subpage (ADR-005) under Club Growth: the section nav keeps
 * Growth current, the breadcrumb leads back through Growth, and the program
 * year comes from the URL-synced page controls, handed down (R3).
 * The history is the recorded prod fixture (D61 / D01, 2026-10-15).
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
  CharterCohortSurvivalFileSchema,
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  type ClubDistrictHistoryClub,
} from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import {
  useClubDistrictHistory,
  type ClubDistrictHistoryState,
} from '../../hooks/useClubDistrictHistory'
import { fetchCharterCohortSurvival } from '../../services/cdnCharterCohortSurvival'
import recorded from '../../__tests__/fixtures/club-district-history-d61-d01.recorded.json'
import d61File from '../../__tests__/fixtures/charter-cohort-survival-d61.json'

const index = ClubDistrictHistoryIndexSchema.parse(recorded.index)
const clubs: Record<string, ClubDistrictHistoryClub> = {}
for (const raw of Object.values(recorded.shards)) {
  Object.assign(clubs, ClubDistrictHistoryShardSchema.parse(raw).clubs)
}
const ready: ClubDistrictHistoryState = {
  status: 'ready',
  loaded: 100,
  total: 100,
  index,
  clubs,
}

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
      dates: ['2026-10-13', '2020-06-30', '2019-06-30'],
      dateRange: { startDate: '2019-06-30', endDate: '2026-10-13' },
    },
    isLoading: false,
  })),
}))

vi.mock('../../hooks/useClubDistrictHistory', () => ({
  useClubDistrictHistory: vi.fn(),
}))

// No district file (a 404) unless a test serves one: the shard fallback.
vi.mock('../../services/cdnCharterCohortSurvival', () => ({
  fetchCharterCohortSurvival: vi.fn(),
}))

const DistrictSurvivalPage = React.lazy(() => import('../DistrictSurvivalPage'))

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/growth/survival',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictSurvivalPage />
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

describe('DistrictSurvivalPage (#1817)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useClubDistrictHistory).mockReturnValue(ready)
    vi.mocked(fetchCharterCohortSurvival).mockResolvedValue(null)
  })
  afterEach(() => cleanup())

  it('renders the survival view under Growth, with Growth current in the section nav', async () => {
    renderAt('/district/61/growth/survival?py=2026')
    expect(
      await screen.findByRole('list', { name: /survival after/i })
    ).toHaveTextContent('51 of 51 clubs')
    expect(
      screen.getByRole('link', { name: 'Growth', current: 'page' })
    ).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs).getByRole('link', { name: 'Growth' }).getAttribute('href')
    ).toBe('/district/61/growth?py=2026')
    expect(crumbs).toHaveTextContent('Club survival')
  })

  it('draws the same survival from the district file, with no history shard (#2061)', async () => {
    vi.mocked(fetchCharterCohortSurvival).mockResolvedValue(
      CharterCohortSurvivalFileSchema.parse(d61File)
    )
    vi.mocked(useClubDistrictHistory).mockReturnValue({
      status: 'loading',
      loaded: 0,
      total: 0,
      index: null,
      clubs: null,
    })
    renderAt('/district/61/growth/survival?py=2026')
    expect(
      await screen.findByRole('list', { name: /survival after/i })
    ).toHaveTextContent('51 of 51 clubs')
    expect(fetchCharterCohortSurvival).toHaveBeenCalledWith('61')
    for (const [options] of vi.mocked(useClubDistrictHistory).mock.calls) {
      expect(options?.enabled).toBe(false)
    }
  })

  it('self-titles the document', async () => {
    renderAt('/district/61/growth/survival')
    await waitFor(() =>
      expect(document.title).toBe('District 61 Club Survival — Toast Stats')
    )
  })

  it('stops at the program year selected in the page controls (R3)', async () => {
    renderAt('/district/61/growth/survival?py=2019')
    const table = await screen.findByRole('table', {
      name: /survival by charter year/i,
    })
    const rows = within(table).getAllByRole('row')
    // header + 3 cohorts (2017-18 … 2019-20) + the pooled footer
    expect(rows).toHaveLength(5)
    expect(within(table).queryByText('2020-21')).toBeNull()
  })

  it('says how far along the history download is while it loads', async () => {
    vi.mocked(useClubDistrictHistory).mockReturnValue({
      status: 'loading',
      loaded: 37,
      total: 100,
      index,
      clubs: null,
    })
    renderAt('/district/61/growth/survival')
    expect(
      await screen.findByText(/loading club history: 37 of 100 files/i)
    ).toHaveAttribute('role', 'status')
  })

  it('says the history is unavailable instead of counting a partial one', async () => {
    vi.mocked(useClubDistrictHistory).mockReturnValue({
      status: 'unavailable',
      loaded: 99,
      total: 100,
      index,
      clubs: null,
    })
    renderAt('/district/61/growth/survival')
    expect(
      await screen.findByText(/club history is not available right now/i)
    ).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('table')).toBeNull()
  })
})
