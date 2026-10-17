/**
 * /region/:n/health and /regions/health (#1815) — the region and world
 * rollup subpages over `snapshots/<date>/region-rollups.json` (#1799).
 * Fixture: recorded prod 2026-10-15. The pages pin the rollups query to
 * the page's own snapshot date (R3).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionHealthPage from '../RegionHealthPage'
import WorldHealthPage from '../WorldHealthPage'
import { fetchCdnRegionRollups } from '../../services/cdn'
import recorded from '../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'
import { RegionRollupsSchema } from '@taverns-red/shared-contracts'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: ['2026-10-15'], count: 1 }),
  fetchCdnRegionRollups: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-15'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-15', generatedAt: 'x' }),
}))

const mocked = vi.mocked(fetchCdnRegionRollups)
const rollups = RegionRollupsSchema.parse(recorded)

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
            <Route path="/region/:n/health" element={<RegionHealthPage />} />
            <Route path="/regions/health" element={<WorldHealthPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('RegionHealthPage', () => {
  it('shows the region rollup and its districts, each linking down', async () => {
    mocked.mockResolvedValue(rollups)
    renderAt('/region/07/health')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Region 07/ })
    ).toBeInTheDocument()
    const kpis = await screen.findByTestId('rollup-kpis')
    expect(within(kpis).getByText('958')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'District 47' })).toHaveAttribute(
      'href',
      '/district/47'
    )
    expect(mocked).toHaveBeenCalledWith('2026-10-15')
  })

  it('says the rollups are not published for a date without them', async () => {
    mocked.mockResolvedValue(null)
    renderAt('/region/07/health')
    expect(await screen.findByTestId('rollups-unavailable')).toHaveTextContent(
      /not published for this date/i
    )
    expect(screen.queryByTestId('rollup-kpis')).not.toBeInTheDocument()
  })

  it('reads an unpadded region id as its padded rollups key (#2130)', async () => {
    mocked.mockResolvedValue(rollups)
    renderAt('/region/7/health')
    const kpis = await screen.findByTestId('rollup-kpis')
    expect(within(kpis).getByText('958')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: /Region 07/ })
    ).toBeInTheDocument()
    expect(screen.queryByTestId('rollups-unavailable')).not.toBeInTheDocument()
  })

  it('says when the region is not in the rollups', async () => {
    mocked.mockResolvedValue(rollups)
    renderAt('/region/99/health')
    expect(await screen.findByTestId('rollups-unavailable')).toHaveTextContent(
      /Region 99/
    )
  })
})

describe('WorldHealthPage', () => {
  it('shows the world rollup and the 14 regions, each linking down', async () => {
    mocked.mockResolvedValue(rollups)
    renderAt('/regions/health')
    const kpis = await screen.findByTestId('rollup-kpis')
    expect(within(kpis).getByText('14,524')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Region 03' })).toHaveAttribute(
      'href',
      '/region/03/health'
    )
  })

  it('keeps the world rollup when regions are unavailable, and says why', async () => {
    mocked.mockResolvedValue({
      ...rollups,
      regions: null,
      regionMembership: null,
      regionMembershipNote: 'No region history for 2026-2027',
    })
    renderAt('/regions/health')
    expect(await screen.findByTestId('rollup-kpis')).toBeInTheDocument()
    expect(screen.getByTestId('rollups-regions-unavailable')).toHaveTextContent(
      'No region history for 2026-2027'
    )
  })
})
