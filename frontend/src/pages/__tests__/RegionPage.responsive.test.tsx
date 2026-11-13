/**
 * RegionPage responsive scroll-region (#689, epic #683 Sprint 6).
 *
 * The region detail table is 19 columns — far wider than a phone. The UX
 * decision (ron-ux) is an INTENTIONAL, DOCUMENTED horizontal scroll, not a
 * card-collapse: a regional ranking table exists to compare districts across
 * rows, which a stacked card destroys. To stop the scroll being a "trap" the
 * scroll container must be (a) keyboard-operable — a focusable, labelled
 * region (WCAG 2.1.1, the axe "scrollable-region-focusable" rule) — and the
 * row-identity columns (Region Rank + District) must stick to the left so the
 * row stays labelled while the metric columns scroll out of view.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionPage from '../RegionPage'
import { fetchCdnRankings } from '../../services/cdn'

// #1301 — empty dates index keeps effectiveDate undefined → the page uses its
// existing fetchCdnRankings ("latest") path, so these fixtures are unchanged.
vi.mock('../../services/cdn', () => ({
  fetchCdnDistrictRegionHistory: vi.fn().mockResolvedValue(null),
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-05-12', generatedAt: 'x' }),
}))

const mockedFetchCdnRankings = vi.mocked(fetchCdnRankings)

const mkRanking = (overrides: Record<string, unknown>) => ({
  districtId: '1',
  districtName: '1',
  region: '7',
  paidClubs: 100,
  totalPayments: 5000,
  distinguishedClubs: 50,
  aggregateScore: 300,
  overallRank: 1,
  paidClubBase: 90,
  paymentBase: 4500,
  clubGrowthPercent: 10,
  paymentGrowthPercent: 10,
  activeClubs: 100,
  selectDistinguished: 20,
  presidentsDistinguished: 10,
  distinguishedPercent: 50,
  clubsRank: 1,
  paymentsRank: 1,
  distinguishedRank: 1,
  ...overrides,
})

const renderRegion = (region: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[`/region/${region}`]}>
          <Routes>
            <Route path="/region/:n" element={<RegionPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RegionPage responsive scroll region (#689, #2702)', () => {
  it('keeps the table in a scroll wrapper that scrolls only when the columns cannot fit', async () => {
    mockedFetchCdnRankings.mockResolvedValue({
      rankings: [mkRanking({ districtId: '7', districtName: 'Seven' })],
      asOfDate: '2026-05-12',
    } as never)

    renderRegion('7')

    // jsdom has no layout, so the columns "fit": the wrapper is a plain
    // block (the header sticks to the page) and is not a tab stop. When the
    // chosen columns overflow, DataTable makes it a labelled, focusable
    // region (the real-browser smoke covers that mode).
    const table = await screen.findByRole('table', {
      name: /region 0?7 district rankings/i,
    })
    const wrapper = table.closest('.dt-scroll')!
    expect(wrapper).toHaveAttribute('data-overflow', 'false')
    expect(wrapper).not.toHaveAttribute('tabindex')
    expect(screen.queryByRole('region', { name: /scroll/i })).toBeNull()
  })

  it('pins the District column, the table row header, to the left', async () => {
    mockedFetchCdnRankings.mockResolvedValue({
      rankings: [mkRanking({ districtId: '7', districtName: 'Seven' })],
      asOfDate: '2026-05-12',
    } as never)

    renderRegion('7')

    const districtCell = await screen.findByTestId('region-district-cell')
    expect(districtCell.tagName).toBe('TH')
    expect(districtCell.className).toMatch(/rankings-sticky-col/)
  })
})
