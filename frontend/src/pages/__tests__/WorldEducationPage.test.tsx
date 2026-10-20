/**
 * /regions/education (#1811) — the worldwide education awards from the
 * #1801 rollup's world block, by region. Fixtures: staging
 * `derived/education-rollup/` recorded 2026-10-17. The page owns the
 * program year (R3): it asks the rollup for the PY its controls selected.
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
import WorldEducationPage from '../WorldEducationPage'
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
            <Route path="/regions/education" element={<WorldEducationPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('WorldEducationPage', () => {
  it('shows the world KPIs and regions for the selected PY', async () => {
    serveRecorded()
    renderAt('/regions/education')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Regions' })
    ).toBeInTheDocument()
    const kpis = await screen.findByRole('list', {
      name: 'Education at a glance',
    })
    expect(within(kpis).getByText('26,497')).toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: 'Regions, education awards' })
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Education' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    // R3: the PY the page controls selected, not one read from a response.
    expect(rollupFn).toHaveBeenCalledWith('2026-2027')
  })

  it('reads the PY from the URL', async () => {
    serveRecorded()
    renderAt('/regions/education?py=2022-2023')
    expect(await screen.findByTestId('education-provenance')).toHaveTextContent(
      '124 of 128 districts with a ledger'
    )
    expect(rollupFn).toHaveBeenCalledWith('2022-2023')
  })

  it('says the rollup is not available yet when the object 404s', async () => {
    rollupFn.mockResolvedValue(null)
    indexFn.mockResolvedValue(null)
    renderAt('/regions/education')
    expect(
      await screen.findByTestId('education-unavailable')
    ).toHaveTextContent(/not available yet/i)
    expect(
      screen.queryByRole('list', { name: 'Education at a glance' })
    ).not.toBeInTheDocument()
  })
})
