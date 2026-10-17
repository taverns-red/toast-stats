/**
 * /region/:n/growth/survival and /regions/growth/survival (#1818) — charter
 * cohort survival at region and world level, routed subpages of the region
 * and regions pages (ADR-005). Each reads one small file the pipeline
 * folds (`config/charter-cohort-survival/{region_<NN>,world}.json`); the
 * program year comes from the page's own URL-synced controls (R3). A 404
 * is "not available yet", never an empty or zero curve. Fixtures: the
 * pipeline fold's Region 09 and world files over the recorded histories.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionSurvivalPage from '../RegionSurvivalPage'
import WorldSurvivalPage from '../WorldSurvivalPage'
import { fetchCharterCohortSurvivalRollup } from '../../services/cdnCharterCohortSurvivalRollup'
import { CharterCohortSurvivalRollupFileSchema } from '@taverns-red/shared-contracts'
import r09Raw from '../../__tests__/fixtures/charter-cohort-survival-region-09.json'
import worldRaw from '../../__tests__/fixtures/charter-cohort-survival-world.json'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi
    .fn()
    .mockResolvedValue({ dates: ['2026-10-15', '2020-06-30'], count: 2 }),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-15'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-15', generatedAt: 'x' }),
}))

vi.mock('../../services/cdnCharterCohortSurvivalRollup', () => ({
  fetchCharterCohortSurvivalRollup: vi.fn(),
}))

const mocked = vi.mocked(fetchCharterCohortSurvivalRollup)
const r09 = CharterCohortSurvivalRollupFileSchema.parse(r09Raw)
const world = CharterCohortSurvivalRollupFileSchema.parse(worldRaw)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderAt = (url: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route
              path="/region/:n/growth/survival"
              element={<RegionSurvivalPage />}
            />
            <Route
              path="/regions/growth/survival"
              element={<WorldSurvivalPage />}
            />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const survivalTable = () =>
  screen.findByRole('table', { name: /survival by charter year/i })

describe('RegionSurvivalPage (#1818)', () => {
  it("reads the region's file and shows its survival table", async () => {
    mocked.mockResolvedValue(r09)
    renderAt('/region/09/growth/survival')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Region 09/ })
    ).toBeInTheDocument()
    const table = await survivalTable()
    expect(
      within(table).getByRole('row', { name: /^2019-20/ })
    ).toHaveTextContent('14')
    expect(mocked).toHaveBeenCalledWith({ kind: 'region', regionId: '09' })
  })

  it('reads an unpadded region id as its padded file (#2130)', async () => {
    mocked.mockResolvedValue(r09)
    renderAt('/region/9/growth/survival')
    await survivalTable()
    expect(mocked).toHaveBeenCalledWith({ kind: 'region', regionId: '09' })
  })

  it('names the club survival section in the region subnav', async () => {
    mocked.mockResolvedValue(r09)
    renderAt('/region/09/growth/survival?py=2026')
    const nav = await screen.findByTestId('region-subnav')
    const link = within(nav).getByRole('link', { name: 'Club survival' })
    expect(link).toHaveAttribute('href', '/region/09/growth/survival?py=2026')
    expect(link).toHaveAttribute('aria-current', 'page')
  })

  it('takes the horizon from the page program year (R3)', async () => {
    mocked.mockResolvedValue(r09)
    renderAt('/region/09/growth/survival?py=2019')
    await survivalTable()
    expect(screen.getAllByText(/through 2019-20/i).length).toBeGreaterThan(0)
  })

  it('says survival is not available yet on a 404, with no curve or 0%', async () => {
    mocked.mockResolvedValue(null)
    renderAt('/region/09/growth/survival')
    expect(
      await screen.findByTestId('survival-not-available')
    ).toHaveTextContent(/not available yet/i)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('says it could not load on a server error', async () => {
    mocked.mockRejectedValue(new Error('503'))
    renderAt('/region/09/growth/survival')
    expect(
      await screen.findByTestId('survival-not-available')
    ).toHaveTextContent(/could not be loaded/i)
  })
})

describe('WorldSurvivalPage (#1818)', () => {
  it("reads the world's file and shows its survival table without a moved-away column", async () => {
    mocked.mockResolvedValue(world)
    renderAt('/regions/growth/survival')
    const table = await survivalTable()
    expect(mocked).toHaveBeenCalledWith({ kind: 'world' })
    expect(
      within(table).queryByRole('columnheader', { name: /moved|other/i })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/chartered worldwide in each program year/i)
    ).toBeInTheDocument()
  })

  it('says survival is not available yet on a 404', async () => {
    mocked.mockResolvedValue(null)
    renderAt('/regions/growth/survival')
    expect(
      await screen.findByTestId('survival-not-available')
    ).toHaveTextContent(/not available yet/i)
  })
})
