/**
 * /region/:n/growth (#1812) and /regions/growth (#1813) — the region and
 * world Club Growth funnels over `reports-rollups.json` (#2012) and
 * `region-rollups.json` (#1799). Fixtures: the #2117 builder over the
 * recorded prod 2026-10-15 sidecars of Regions 05 and 09; the recorded prod
 * region-rollups of that date. Both queries are pinned to the page's own
 * snapshot date (R3).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RegionRollupsSchema,
  ReportsRollupsSchema,
} from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionGrowthPage from '../RegionGrowthPage'
import WorldGrowthPage from '../WorldGrowthPage'
import {
  fetchCdnRegionRollups,
  fetchCdnReportsRollups,
} from '../../services/cdn'
import reportsRecorded from '../../__tests__/fixtures/reports-rollups-2026-10-15.recorded.json'
import rollupsRecorded from '../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: ['2026-10-15'], count: 1 }),
  fetchCdnRegionRollups: vi.fn(),
  fetchCdnReportsRollups: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-15'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-15', generatedAt: 'x' }),
}))

const mockedRollups = vi.mocked(fetchCdnRegionRollups)
const mockedReports = vi.mocked(fetchCdnReportsRollups)
const reports = ReportsRollupsSchema.parse(reportsRecorded)
const rollups = RegionRollupsSchema.parse(rollupsRecorded)

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
            <Route path="/region/:n/growth" element={<RegionGrowthPage />} />
            <Route path="/regions/growth" element={<WorldGrowthPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const funnel = () => screen.findByRole('list', { name: 'Club Growth funnel' })

describe('RegionGrowthPage', () => {
  it('shows the four stages as text and links each to its section', async () => {
    mockedReports.mockResolvedValue(reports)
    mockedRollups.mockResolvedValue(rollups)
    renderAt('/region/05/growth')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Region 05/ })
    ).toBeInTheDocument()
    const strip = await funnel()
    const stages = within(strip).getAllByRole('listitem')
    expect(stages.map(s => s.textContent)).toEqual([
      expect.stringMatching(/Prospective.*35/),
      expect.stringMatching(/Chartered.*3/),
      expect.stringMatching(/Coached.*35/),
      expect.stringMatching(/Suspended.*5/),
    ])
    expect(mockedReports).toHaveBeenCalledWith('2026-10-15')
    expect(mockedRollups).toHaveBeenCalledWith('2026-10-15')
  })

  it('drills every stage down to the districts, linking to their funnels', async () => {
    mockedReports.mockResolvedValue(reports)
    mockedRollups.mockResolvedValue(rollups)
    renderAt('/region/05/growth')
    await funnel()
    for (const stage of ['prospective', 'chartered', 'coached', 'suspended']) {
      const table = screen.getByTestId(`rollup-growth-${stage}-table`)
      const link = within(table).getByRole('link', { name: 'District 61' })
      expect(link.getAttribute('href')).toBe(
        `/district/61/growth#growth-${stage}`
      )
      expect(within(table).getAllByRole('row')).toHaveLength(1 + 7)
    }
    // The prospective ladder is a table, not only a sentence.
    const ladder = screen.getByTestId('rollup-growth-ladder-table')
    expect(within(ladder).getByText('Application to Organize')).toBeVisible()
  })

  it('says "not available yet" when the reports artifact is a 404', async () => {
    mockedReports.mockResolvedValue(null)
    mockedRollups.mockResolvedValue(rollups)
    renderAt('/region/05/growth')
    const strip = await funnel()
    const [prospective, chartered] = within(strip).getAllByRole('listitem')
    expect(prospective).toHaveTextContent(/Unknown/)
    expect(prospective).toHaveTextContent(/Not available yet/)
    expect(prospective).not.toHaveTextContent(/\b0\b/)
    expect(chartered).toHaveTextContent('3')
    expect(screen.getByTestId('rollup-growth-reports-note')).toHaveTextContent(
      /not available yet/i
    )
    const table = screen.getByTestId('rollup-growth-prospective-table')
    expect(within(table).getAllByText('Not available').length).toBe(7)
  })

  it('says not available when neither artifact has the region', async () => {
    mockedReports.mockResolvedValue(null)
    mockedRollups.mockResolvedValue(null)
    renderAt('/region/05/growth')
    expect(await screen.findByTestId('rollups-unavailable')).toHaveTextContent(
      /not available yet/i
    )
    expect(
      screen.queryByRole('list', { name: 'Club Growth funnel' })
    ).not.toBeInTheDocument()
  })

  it('reads an unpadded region id as its padded key (#2130)', async () => {
    mockedReports.mockResolvedValue(reports)
    mockedRollups.mockResolvedValue(rollups)
    renderAt('/region/5/growth')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Region 05/ })
    ).toBeInTheDocument()
    await funnel()
  })

  it('shows no person names — counts only', async () => {
    mockedReports.mockResolvedValue(reports)
    mockedRollups.mockResolvedValue(rollups)
    const { container } = renderAt('/region/05/growth')
    await funnel()
    expect(container.textContent).not.toMatch(/@|\+\d{10,}/)
    expect(container.textContent).toMatch(/Counts only/)
  })
})

describe('WorldGrowthPage', () => {
  it('rolls up worldwide and drills down by region', async () => {
    mockedReports.mockResolvedValue(reports)
    mockedRollups.mockResolvedValue(rollups)
    renderAt('/regions/growth?py=2026&date=2026-10-15')
    const strip = await funnel()
    expect(within(strip).getAllByRole('listitem')[0]).toHaveTextContent('51')
    const table = screen.getByTestId('rollup-growth-coached-table')
    expect(
      within(table).getByRole('link', { name: 'Region 05' })
    ).toHaveAttribute(
      'href',
      '/region/05/growth?py=2026&date=2026-10-15#growth-coached'
    )
    // Coverage is stated: the reports figures cover the districts they cover.
    expect(screen.getByTestId('rollup-growth-coverage')).toHaveTextContent(
      /12 districts/
    )
  })
})
