/**
 * #2580 group 2: the region page shows the confirmed Distinguished count as
 * the headline, "+N qualifying today" beside it from the pipeline's
 * region-rollups `distinguishedCounts` (#2553), and the visible basis note.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import '@testing-library/jest-dom/vitest'
import RegionPage from '../RegionPage'
import { fetchCdnRankings, fetchCdnRegionRollups } from '../../services/cdn'

vi.mock('../../services/cdn', () => ({
  fetchCdnDistrictRegionHistory: vi.fn().mockResolvedValue(null),
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-05-12', generatedAt: 'x' }),
  fetchCdnRegionRollups: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-05-12'),
}))

const tier = { confirmed: 0, provisional: 0 }
const counts = (confirmed: number, provisional: number) => ({
  confirmed,
  provisional,
  byTier: {
    distinguished: { confirmed, provisional },
    select: tier,
    presidents: tier,
    smedley: tier,
  },
})

const mk = (overrides: Record<string, unknown>) => ({
  districtId: '1',
  districtName: '1',
  region: '01',
  paidClubs: 100,
  paidClubBase: 90,
  totalPayments: 5000,
  paymentBase: 4500,
  distinguishedClubs: 50,
  aggregateScore: 300,
  overallRank: 1,
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

const rankings = [
  mk({ districtId: '86', districtName: 'D86', aggregateScore: 300 }),
  mk({
    districtId: '74',
    districtName: 'D74',
    aggregateScore: 200,
    overallRank: 5,
  }),
]

const rollups = {
  regions: { '01': { distinguishedCounts: counts(100, 25) } },
  districts: {
    '86': { distinguishedCounts: counts(50, 7) },
    '74': { distinguishedCounts: counts(50, 0) },
  },
}

const setup = (path = '/region/1') =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/region/:n" element={<RegionPage />} />
            <Route path="*" element={null} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )

describe('RegionPage — confirmed headline + qualifying today (#2580)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(fetchCdnRankings).mockResolvedValue({
      rankings,
      asOfDate: '2025-11-22',
      generatedAt: '2025-11-22T00:00:00Z',
    } as unknown as Awaited<ReturnType<typeof fetchCdnRankings>>)
    vi.mocked(fetchCdnRegionRollups).mockResolvedValue(
      rollups as unknown as Awaited<ReturnType<typeof fetchCdnRegionRollups>>
    )
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('KPI card: confirmed headline with +N qualifying today beside it', async () => {
    setup()
    const card = await screen.findByLabelText('Distinguished Clubs KPI')
    expect(
      await within(card).findByTestId('distinguished-provisional')
    ).toHaveTextContent('+25 qualifying today')
    expect(
      within(card).getByTestId('distinguished-confirmed')
    ).toHaveTextContent(/^100$/)
  })

  it('table: the district row carries its own extra, none for 0', async () => {
    // The URL sort shows the column even at the narrowest width.
    setup('/region/1?sort=distinguished&dir=desc')
    const table = await screen.findByRole('table', {
      name: /region 0?1 district rankings/i,
    })
    const rows = within(table).getAllByRole('row')
    const r86 = rows.find(r => /D86/.test(r.textContent ?? ''))!
    expect(
      await within(r86).findByTestId('distinguished-provisional')
    ).toHaveTextContent('+7 qualifying today')
    const r74 = rows.find(r => /D74/.test(r.textContent ?? ''))!
    expect(within(r74).queryByTestId('distinguished-provisional')).toBeNull()
  })

  it('says what the two numbers mean in visible text', async () => {
    setup()
    expect(await screen.findByTestId('distinguished-basis-note')).toBeVisible()
  })

  it('without published counts it keeps the rankings sum and no extra', async () => {
    vi.mocked(fetchCdnRegionRollups).mockResolvedValue(null)
    setup()
    const card = await screen.findByLabelText('Distinguished Clubs KPI')
    expect(
      within(card).getByTestId('distinguished-confirmed')
    ).toHaveTextContent(/^100$/)
    expect(within(card).queryByTestId('distinguished-provisional')).toBeNull()
  })
})
