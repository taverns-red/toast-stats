/**
 * District Training page (#2296) — `/district/:id/training`.
 *
 * A real routed subpage (ADR-005, no tabs): the section nav marks it
 * current; the threshold (1–7, default 4), division and area live in the
 * URL; the program year and date come from the URL-synced page controls and
 * are handed down (R3). Fixture: the captured D61 2026-10-11 export.
 */
import React, { Suspense } from 'react'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  fireEvent,
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
import type { ScrapedRecord } from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import { useTimeSeries } from '../../hooks/useTimeSeries'

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
      dates: ['2026-10-11', '2025-10-31'],
      dateRange: { startDate: '2025-10-31', endDate: '2026-10-11' },
    },
    isLoading: false,
  })),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(),
}))

vi.mock('../../hooks/useTimeSeries', () => ({
  useTimeSeries: vi.fn(),
}))

const rows = (() => {
  const raw = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../packages/analytics-core/src/analytics/__tests__/fixtures/d61-2026-10-11-club-performance.json'
      ),
      'utf-8'
    )
  ) as string[][]
  const header = raw[0]!
  return raw
    .slice(1)
    .filter(row => row.length === header.length)
    .map(
      row =>
        Object.fromEntries(
          header.map((key, i) => [key, row[i] ?? ''])
        ) as ScrapedRecord
    )
})()

/** Last year's snapshot: every club at 4 officers in Round 1. */
const lastYearRows = rows.map(r => ({ ...r, 'Off. Trained Round 1': '4' }))

const point = (date: string, round1?: number[]) => ({
  date,
  snapshotId: date,
  membership: 0,
  payments: 0,
  dcpGoals: 0,
  distinguishedTotal: 0,
  clubCounts: { total: 0, thriving: 0, vulnerable: 0, interventionRequired: 0 },
  ...(round1 && {
    officerTraining: { round1, round2: [161, 0, 0, 0, 0, 0, 0, 0] },
  }),
})

const DistrictTrainingPage = React.lazy(() => import('../DistrictTrainingPage'))

beforeAll(async () => {
  await import('../DistrictTrainingPage')
})

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/training',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictTrainingPage />
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

describe('DistrictTrainingPage (#2296)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDistrictStatistics).mockImplementation(
      (districtId, date) =>
        ({
          data: !districtId
            ? undefined
            : {
                data: {
                  clubPerformance: date === '2025-10-31' ? lastYearRows : rows,
                },
              },
          isLoading: false,
        }) as unknown as ReturnType<typeof useDistrictStatistics>
    )
    vi.mocked(useTimeSeries).mockReturnValue({
      data: {
        years: {
          '2026-2027': {
            dataPoints: [
              point('2026-07-26'), // published before the field existed
              point('2026-08-31', [19, 5, 3, 14, 43, 25, 27, 25]),
            ],
          },
          '2025-2026': {
            dataPoints: [point('2025-08-31', [61, 0, 0, 0, 100, 0, 0, 0])],
          },
        },
      },
    } as unknown as ReturnType<typeof useTimeSeries>)
  })
  afterEach(() => cleanup())

  it('is a routed subpage with Training current in the section nav', async () => {
    renderAt('/district/61/training')
    expect(await screen.findByTestId('training-page')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Training', current: 'page' })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(document.title).toBe('District 61 Officer Training — Toast Stats')
    )
  })

  it('outside a round: Round 1 shows final results, Round 2 its opening date', async () => {
    renderAt('/district/61/training')
    expect(await screen.findByTestId('training-context')).toHaveTextContent(
      'Round 2 opens Nov 1, 2026'
    )
    expect(screen.getByTestId('training-round-1-status')).toHaveTextContent(
      'Closed Aug 31, 2026 · final results'
    )
    expect(screen.getByTestId('training-round-2-status')).toHaveTextContent(
      'Opens Nov 1, 2026'
    )
  })

  it('headline: % with 4+ and % with all seven (D61 Round 1: 120 and 25 of 161)', async () => {
    renderAt('/district/61/training')
    const round1 = await screen.findByTestId('training-round-1')
    expect(round1).toHaveTextContent('75%clubs with 4+ officers trained')
    expect(round1).toHaveTextContent('16%clubs with all seven officers trained')
    expect(round1).toHaveTextContent('120 of 161')
    expect(round1).toHaveTextContent('22 are 1–3 short · 19 at 0')
  })

  it('compares with the closest snapshot one year earlier', async () => {
    renderAt('/district/61/training')
    expect(
      await screen.findByTestId('training-round-1-lastyear')
    ).toHaveTextContent('Last year on Oct 31, 2025: 100% at 4+ (161 of 161')
  })

  it('reads ?threshold=7 as "All seven officers" and drives every count', async () => {
    renderAt('/district/61/training?threshold=7')
    const select = await screen.findByRole('combobox', { name: 'Threshold' })
    expect(select).toHaveDisplayValue('All seven officers')
    expect(screen.getByTestId('training-round-1')).toHaveTextContent(
      '25 of 161'
    )
  })

  it('whitelists the threshold: ?threshold=9 falls back to 4', async () => {
    renderAt('/district/61/training?threshold=9')
    expect(
      await screen.findByRole('combobox', { name: 'Threshold' })
    ).toHaveDisplayValue('4+ officers (DCP goal 9)')
  })

  it('keeps the threshold in the URL, and drops it at the default', async () => {
    const router = renderAt('/district/61/training')
    const select = await screen.findByRole('combobox', { name: 'Threshold' })
    fireEvent.change(select, { target: { value: '7' } })
    await waitFor(() =>
      expect(router.state.location.search).toContain('threshold=7')
    )
    fireEvent.change(select, { target: { value: '4' } })
    await waitFor(() =>
      expect(router.state.location.search).not.toContain('threshold')
    )
  })

  it('filters by division and area from the URL', async () => {
    renderAt('/district/61/training?division=I&area=93')
    await screen.findByTestId('training-page')
    expect(
      screen.getByRole('heading', { name: /^Area 93 · \d+ clubs?$/ })
    ).toBeInTheDocument()
    const table = screen.getByTestId('training-club-table')
    expect(within(table).getByText('Extra-Expressif')).toBeInTheDocument()
  })

  it('labels where the progress record starts instead of drawing zeros', async () => {
    renderAt('/district/61/training')
    expect(
      await screen.findByTestId('training-round-1-curve-note')
    ).toHaveTextContent("This year's record starts Aug 31.")
    expect(screen.getByTestId('training-round-2-curve-note')).toHaveTextContent(
      'No daily record for this round yet'
    )
  })

  it('is not presented as education', async () => {
    renderAt('/district/61/training')
    const page = await screen.findByTestId('training-page')
    expect(page.textContent).not.toMatch(/education/i)
  })
})
