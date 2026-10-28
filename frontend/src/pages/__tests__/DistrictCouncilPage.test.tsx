/**
 * District Council credentials page (#2300) — `/district/:id/council?date=`.
 *
 * Clubs in good standing, their votes and the quorum as of a council date,
 * from the latest district snapshot on or before it. A snapshot from another
 * dues period (Apr 1 / Oct 1) gives no count. The page reads TI's club status
 * through the real hook and derivation; only the CDN fetch is a seam.
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
  fireEvent,
  render,
  screen,
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
import { fetchCdnDistrictSnapshot } from '../../services/cdn'
import { exportCouncilStanding } from '../../utils/csvExport'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import fixture from '../../__tests__/fixtures/council-standing.recorded.json'

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
    isLoading: false,
    error: null,
  })),
}))

const DATES = ['2026-09-29', '2026-09-30', '2026-10-08', '2026-10-27']
vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(),
}))

vi.mock('../../services/cdn', async () => {
  const actual =
    await vi.importActual<typeof import('../../services/cdn')>(
      '../../services/cdn'
    )
  return { ...actual, fetchCdnDistrictSnapshot: vi.fn() }
})

vi.mock('../../utils/csvExport', async () => {
  const actual = await vi.importActual<typeof import('../../utils/csvExport')>(
    '../../utils/csvExport'
  )
  return { ...actual, exportCouncilStanding: vi.fn() }
})

const DistrictCouncilPage = React.lazy(() => import('../DistrictCouncilPage'))

// Compile the page's module graph once, up front, so the first test's findBy
// window measures the page, not Vite's cold transform (#2248).
beforeAll(async () => {
  await import('../DistrictCouncilPage')
})

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/council',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictCouncilPage />
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

const mockedFetch = vi.mocked(fetchCdnDistrictSnapshot)

describe('DistrictCouncilPage (#2300)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDistrictCachedDates).mockReturnValue({
      data: {
        districtId: '61',
        dates: DATES,
        count: DATES.length,
        dateRange: { startDate: DATES[0], endDate: DATES[DATES.length - 1] },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedFetch.mockResolvedValue({
      districtId: '61',
      districtName: 'District 61',
      collectedAt: '2026-10-27T12:00:00Z',
      status: 'success',
      data: { clubs: fixture.d61_2026_10_27 },
    } as never)
  })
  afterEach(() => cleanup())

  it('shows clubs in good standing, club votes and quorum, with citations', async () => {
    renderAt('/district/61/council?date=2026-10-27')
    const strip = await screen.findByTestId('council-headline')
    expect(within(strip).getByTestId('council-good').textContent).toBe('3')
    expect(within(strip).getByTestId('council-votes').textContent).toBe('6')
    expect(within(strip).getByTestId('council-quorum').textContent).toBe('1')
    expect(strip.textContent).toMatch(/DAB Art\. IX\(a\)/)
    expect(strip.textContent).toMatch(/X\(d\)/)
    expect(strip.textContent).toMatch(/DAB Art\. X\(c\)/)
    expect(mockedFetch).toHaveBeenCalledWith('2026-10-27', '61')
  })

  it('lists both groups by division, naming each reason', async () => {
    renderAt('/district/61/council?date=2026-10-27')
    const good = await screen.findByRole('region', {
      name: /^in good standing \(3\)/i,
    })
    expect(within(good).getByText('Limestone City Club')).toBeInTheDocument()
    expect(within(good).getByText('Division A')).toBeInTheDocument()
    const notGood = screen.getByRole('region', {
      name: /^not in good standing \(2\)/i,
    })
    expect(
      within(notGood).getByText('Fewer than 8 paid members this dues period')
    ).toBeInTheDocument()
    expect(
      within(notGood).getByText('TI status: Ineligible')
    ).toBeInTheDocument()
    expect(
      within(notGood).getByRole('link', { name: 'CFB Kingston Toastmasters' })
    ).toHaveAttribute('href', '/district/61/club/9560')
  })

  it('carries the disclaimer, a Methodology link and the Red Vote card', async () => {
    renderAt('/district/61/council?date=2026-10-27')
    await screen.findByTestId('council-headline')
    expect(screen.getByTestId('council-disclaimer').textContent).toContain(
      "derived from TI's public dashboard, not TI's official credentials list (District Central)"
    )
    expect(
      screen.getByRole('link', { name: /how this is worked out/i })
    ).toHaveAttribute('href', '/methodology#council-voting-strength')
    expect(screen.getByTestId('red-vote-promo')).toBeInTheDocument()
  })

  it('exports the list it shows', async () => {
    renderAt('/district/61/council?date=2026-10-27')
    await screen.findByTestId('council-headline')
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    expect(vi.mocked(exportCouncilStanding)).toHaveBeenCalledWith(
      expect.objectContaining({
        districtId: '61',
        snapshotDate: '2026-10-27',
        councilDate: '2026-10-27',
      })
    )
    const arg = vi.mocked(exportCouncilStanding).mock.calls[0]![0]
    expect(arg.rows).toHaveLength(5)
  })

  it('says which TI data it used and how far it is from the date', async () => {
    renderAt('/district/61/council?date=2026-10-12')
    expect((await screen.findByTestId('council-source')).textContent).toMatch(
      /Oct 8, 2026.*4 days before/
    )
    expect(mockedFetch).toHaveBeenCalledWith('2026-10-08', '61')
    expect(screen.queryByTestId('council-stale')).toBeNull()
  })

  it('notes a gap of more than 7 days', async () => {
    renderAt('/district/61/council?date=2026-10-20')
    expect((await screen.findByTestId('council-stale')).textContent).toMatch(
      /12 days/
    )
    expect(await screen.findByTestId('council-headline')).toBeInTheDocument()
  })

  it('shows no count when the nearest data is from another dues period', async () => {
    renderAt('/district/61/council?date=2026-10-03')
    const msg = await screen.findByTestId('council-period-mismatch')
    expect(msg.textContent).toMatch(/October 2026 dues period/)
    expect(msg.textContent).toMatch(/Sep 30, 2026/)
    expect(screen.queryByTestId('council-headline')).toBeNull()
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('says when there is no data on or before the date', async () => {
    renderAt('/district/61/council?date=2025-01-15')
    expect((await screen.findByTestId('council-none')).textContent).toMatch(
      /Sep 29, 2026/
    )
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('defaults to the latest snapshot and writes a picked date to the URL', async () => {
    const router = renderAt('/district/61/council')
    const input = (await screen.findByLabelText(
      /council date/i
    )) as HTMLInputElement
    expect(input.value).toBe('2026-10-27')
    expect(input).toHaveAttribute('min', '2026-09-29')
    await screen.findByTestId('council-headline')
    fireEvent.change(input, { target: { value: '2026-10-12' } })
    expect(router.state.location.search).toBe('?date=2026-10-12')
    expect((await screen.findByTestId('council-source')).textContent).toMatch(
      /Oct 8, 2026/
    )
  })

  it('ignores a malformed date param and uses the latest snapshot', async () => {
    renderAt('/district/61/council?date=not-a-date')
    await screen.findByTestId('council-headline')
    expect(mockedFetch).toHaveBeenCalledWith('2026-10-27', '61')
  })
})
