/**
 * District Meetings page (#1796, epic #1781) — `/district/:id/meetings`.
 *
 * A real routed subpage (ADR-005): the section nav marks it current, the
 * mode and selected cell live in the URL (`?mode=`, `?slot=`), and the PY and
 * date come from the URL-synced page controls and are handed down (R3).
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
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import fixture from '../../__tests__/fixtures/meeting-schedule-d61-2026-10-15.json'

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
      dates: ['2026-10-15', '2026-10-14'],
      dateRange: { startDate: '2026-10-14', endDate: '2026-10-15' },
    },
    isLoading: false,
  })),
}))

// #2405 — the page's CDN reads outside the mocked hooks, stubbed so no
// request leaves the test: the PY dates index (ProgramYearProvider), the
// latest-date manifest and the undated rankings (district chrome). The rankings
// carry no row for this district, so nothing rank-derived renders.
vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-10-14', '2026-10-15'],
    count: 2,
    generatedAt: '2026-10-15T12:00:00Z',
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-10-15',
    generatedAt: '2026-10-15T12:00:00Z',
  }),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-15'),
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2026-10-15',
    generatedAt: '2026-10-15T12:00:00Z',
  }),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
}))

const heatmapProps: Array<Record<string, unknown>> = []
vi.mock('../../components/MeetingHeatmap', async () => {
  const actual = await vi.importActual<
    typeof import('../../components/MeetingHeatmap')
  >('../../components/MeetingHeatmap')
  return {
    ...actual,
    MeetingHeatmap: (
      props: React.ComponentProps<typeof actual.MeetingHeatmap>
    ) => {
      heatmapProps.push(props as unknown as Record<string, unknown>)
      return <actual.MeetingHeatmap {...props} />
    },
  }
})

const DistrictMeetingsPage = React.lazy(() => import('../DistrictMeetingsPage'))

// Compile the page's module graph (and its on-demand chunks) once, up front:
// otherwise the first test's 1 s findBy window measures Vite's cold
// transform of the whole graph, not the page; on a slow CI runner that alone
// overruns the window (#2248; same pattern as DistrictMapPage.test.tsx).
beforeAll(async () => {
  await import('../DistrictMeetingsPage')
})

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/meetings',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictMeetingsPage />
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

describe('DistrictMeetingsPage (#1796)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    heatmapProps.length = 0
    vi.mocked(useDistrictAnalytics).mockReturnValue({
      data: { allClubs: fixture.clubs, topGrowthClubs: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDistrictAnalytics>)
  })
  afterEach(() => cleanup())

  it('renders the heatmap with Meetings current in the section nav', async () => {
    renderAt('/district/61/meetings')
    expect(
      await screen.findByRole('list', { name: /meetings at a glance/i })
    ).toHaveTextContent('158 of 161')
    expect(
      screen.getByRole('link', { name: 'Meetings', current: 'page' })
    ).toBeInTheDocument()
  })

  it('self-titles the document', async () => {
    renderAt('/district/61/meetings')
    await waitFor(() =>
      expect(document.title).toBe('District 61 Meeting Times — Toast Stats')
    )
  })

  it('reads mode and slot from the URL, whitelisted', async () => {
    renderAt('/district/61/meetings?mode=online&slot=wed-19')
    await screen.findByRole('list', { name: /meetings at a glance/i })
    const props = heatmapProps.at(-1)!
    expect(props['mode']).toBe('online')
    expect(props['selection']).toEqual({ day: 'Wednesday', hour: 19 })
  })

  it('garbage mode / slot fall back to all / none', async () => {
    renderAt('/district/61/meetings?mode=zoom&slot=xyz')
    await screen.findByRole('list', { name: /meetings at a glance/i })
    const props = heatmapProps.at(-1)!
    expect(props['mode']).toBe('all')
    expect(props['selection']).toBeNull()
  })

  it('hands the selected PY and date down for the analytics read and the map link (R3)', async () => {
    renderAt('/district/61/meetings?date=2026-10-14')
    await screen.findByRole('list', { name: /meetings at a glance/i })
    expect(vi.mocked(useDistrictAnalytics)).toHaveBeenLastCalledWith(
      '61',
      '2026-07-01',
      '2026-10-14'
    )
    expect(heatmapProps.at(-1)!['mapContext']).toEqual({
      py: '2026',
      date: '2026-10-14',
    })
  })
})
