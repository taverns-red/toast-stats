/**
 * /region/:n/education (#1810) — the region's education awards from the
 * #1801 rollup: KPI strip, Pathways/Legacy/DTM, level rows, the level × path
 * matrix, multi-year bars and one row per district linking to its own
 * education page. Fixtures: staging `derived/education-rollup/` recorded
 * 2026-10-17. The page owns the program year (R3): it asks the rollup for
 * the PY its controls selected, never the one in a response.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  EducationRollupIndexSchema,
  EducationRollupProgramYearSchema,
} from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionEducationPage from '../RegionEducationPage'
import {
  fetchCdnEducationRollup,
  fetchCdnEducationRollupIndex,
} from '../../services/cdn'
import current from '../../__tests__/fixtures/education-rollup-2026-2027.recorded.json'
import older from '../../__tests__/fixtures/education-rollup-2022-2023.recorded.json'
import recordedIndex from '../../__tests__/fixtures/education-rollup-index.recorded.json'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2023-06-30', '2026-10-16'],
    count: 2,
  }),
  fetchCdnEducationRollup: vi.fn(),
  fetchCdnEducationRollupIndex: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-16'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-16', generatedAt: 'x' }),
}))

const rollupFn = vi.mocked(fetchCdnEducationRollup)
const indexFn = vi.mocked(fetchCdnEducationRollupIndex)
const byPy: Record<string, unknown> = {
  '2026-2027': EducationRollupProgramYearSchema.parse(current),
  '2022-2023': EducationRollupProgramYearSchema.parse(older),
}
const index = EducationRollupIndexSchema.parse(recordedIndex)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const serveRecorded = () => {
  rollupFn.mockImplementation(
    async py => (byPy[py] ?? null) as Awaited<ReturnType<typeof rollupFn>>
  )
  indexFn.mockResolvedValue(index)
}

const renderAt = (url: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route
              path="/region/:n/education"
              element={<RegionEducationPage />}
            />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('RegionEducationPage', () => {
  it('shows the region’s KPIs, programs and levels for the selected PY', async () => {
    serveRecorded()
    renderAt('/region/01/education')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Region 01/ })
    ).toBeInTheDocument()
    const kpis = await screen.findByRole('list', {
      name: 'Education at a glance',
    })
    expect(within(kpis).getByText('1,562')).toBeInTheDocument()
    expect(within(kpis).getByText('1,313')).toBeInTheDocument()
    expect(within(kpis).getByText('577')).toBeInTheDocument()
    const programs = screen.getByRole('list', { name: 'Awards by program' })
    expect(within(programs).getByText('Pathways')).toBeInTheDocument()
    expect(within(programs).getByText('Legacy')).toBeInTheDocument()
    expect(within(programs).getByText('1,539')).toBeInTheDocument()
    const levels = screen.getByRole('list', { name: 'Awards by level' })
    expect(within(levels).getByText('557')).toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: 'Level × path, Pathways awards' })
    ).toBeInTheDocument()
    expect(screen.getByTestId('education-provenance')).toHaveTextContent(
      /as of 2026-10-16/
    )
    // R3: the PY the page controls selected, not one read from a response.
    expect(rollupFn).toHaveBeenCalledWith('2026-2027')
  })

  it('one row per district, each linking to its own education page', async () => {
    serveRecorded()
    renderAt('/region/01/education')
    const table = await screen.findByRole('table', {
      name: 'Region 01 districts, education awards',
    })
    const link = within(table).getByRole('link', { name: 'District 02' })
    expect(link).toHaveAttribute('href', '/district/02/education?py=2026-2027')
    const row = link.closest('tr')!
    expect(within(row).getByText('285')).toBeInTheDocument()
    expect(within(table).getAllByRole('link')).toHaveLength(7)
  })

  it('a district without a ledger reads "Not available", not zero', async () => {
    serveRecorded()
    renderAt('/region/01/education?py=2022-2023')
    const table = await screen.findByRole('table', {
      name: 'Region 01 districts, education awards',
    })
    expect(rollupFn).toHaveBeenCalledWith('2022-2023')
    const row = within(table)
      .getByRole('link', { name: 'District 09' })
      .closest('tr')!
    expect(within(row).getByText(/Not available/)).toBeInTheDocument()
    expect(screen.getByTestId('education-provenance')).toHaveTextContent(
      /6 of 9 districts/
    )
  })

  it('multi-year bars stack Legacy and Pathways, every value printed', async () => {
    serveRecorded()
    renderAt('/region/01/education')
    const years = await screen.findByRole('list', {
      name: 'Awards by program year',
    })
    const first = within(years).getByText('2016-17').closest('li')!
    expect(first).toHaveTextContent('4,321')
    expect(first).toHaveTextContent(/Legacy 4,225/)
    expect(first).toHaveTextContent(/Pathways 0/)
    expect(within(years).getAllByRole('listitem')).toHaveLength(11)
  })

  it('says the rollup is not available yet when the object 404s', async () => {
    rollupFn.mockResolvedValue(null)
    indexFn.mockResolvedValue(null)
    renderAt('/region/01/education')
    expect(
      await screen.findByTestId('education-unavailable')
    ).toHaveTextContent(/not available yet/i)
    expect(
      screen.queryByRole('list', { name: 'Education at a glance' })
    ).not.toBeInTheDocument()
  })

  it('says so when the region is not in the PY’s rollup', async () => {
    serveRecorded()
    renderAt('/region/15/education')
    expect(
      await screen.findByTestId('education-unavailable')
    ).toHaveTextContent(/Region 15/)
  })

  it('reads an unpadded region id as its padded key (#2130)', async () => {
    serveRecorded()
    renderAt('/region/1/education')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Region 01/ })
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('list', { name: 'Education at a glance' })
    ).toBeInTheDocument()
  })
})
