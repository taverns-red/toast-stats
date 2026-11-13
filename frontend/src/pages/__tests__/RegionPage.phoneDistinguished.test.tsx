/* #2580: Ron (2026-11-13) wants "+N qualifying today" in the compact phone
 * table too, on its own line under the confirmed count; nothing for N=0. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import '@testing-library/jest-dom/vitest'
import RegionPage from '../RegionPage'
import { fetchCdnRankings, fetchCdnRegionRollups } from '../../services/cdn'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

vi.mock('../../services/cdn', () => ({
  fetchCdnDistrictRegionHistory: vi.fn().mockResolvedValue(null),
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-05-12'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-05-12', generatedAt: 'x' }),
  fetchCdnRegionRollups: vi.fn(),
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

const row = {
  districtId: '86',
  districtName: 'D86',
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
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RegionPage phone view (#2580)', () => {
  it('shows +N qualifying today under the confirmed count in the compact table', async () => {
    vi.mocked(fetchCdnRankings).mockResolvedValue({
      rankings: [row],
      asOfDate: '2025-11-22',
      generatedAt: 'x',
    } as unknown as Awaited<ReturnType<typeof fetchCdnRankings>>)
    vi.mocked(fetchCdnRegionRollups).mockResolvedValue({
      regions: { '01': { distinguishedCounts: counts(50, 7) } },
      districts: { '86': { distinguishedCounts: counts(50, 7) } },
    } as unknown as Awaited<ReturnType<typeof fetchCdnRegionRollups>>)
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ProgramYearProvider>
          <MemoryRouter initialEntries={['/region/1']}>
            <Routes>
              <Route path="/region/:n" element={<RegionPage />} />
            </Routes>
          </MemoryRouter>
        </ProgramYearProvider>
      </QueryClientProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Dist. clubs' }))
    await screen.findAllByTestId('distinguished-provisional')
    const table = document.querySelector(
      'table.priority-columns__table'
    ) as HTMLElement
    expect(table).toHaveTextContent('50')
    expect(
      table.querySelector('[data-testid="distinguished-provisional"]')
    ).toHaveTextContent('+7 qualifying today')
  })
})
