import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionsPage from '../RegionsPage'

/* #2127 — /regions draws one membership sparkline per region from ONE
   file, time-series/regions/{PY}.json (the builder's output over the prod
   2026-27 district series), instead of ~94 district series fetches. On a
   404 (until the file reaches prod) the leaderboard renders as before. */

const cdn = vi.hoisted(() => ({ series: null as unknown }))

vi.mock('../../services/cdn', async () => {
  const recorded = (
    await import('../../__tests__/fixtures/region-membership-series-2026-2027.recorded.json')
  ).default
  cdn.series = recorded
  const ranking = (region: string, districtId: string) => ({
    districtId,
    districtName: `District ${districtId}`,
    region,
    paidClubs: 50,
    paidClubBase: 48,
    clubGrowthPercent: 4,
    totalPayments: 2000,
    paymentBase: 1900,
    paymentGrowthPercent: 5,
    activeClubs: 50,
    distinguishedClubs: 20,
    selectDistinguished: 5,
    presidentsDistinguished: 3,
    distinguishedPercent: 40,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    overallRank: 1,
    aggregateScore: 100,
    smedleyDistinguished: 2,
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
    clubsWith20PlusMembers: 10,
    newCharteredClubs: 1,
    newPayments: 100,
    aprilPayments: 200,
    octoberPayments: 300,
    latePayments: 0,
    charterPayments: 0,
  })
  const rankings = {
    asOfDate: '2026-10-16',
    rankings: [ranking('01', '21'), ranking('05', '61')],
  }
  return {
    fetchCdnDates: vi.fn().mockResolvedValue({
      dates: ['2026-10-16'],
      count: 1,
      generatedAt: '2026-10-17T00:00:00Z',
    }),
    fetchCdnRankings: vi.fn().mockResolvedValue(rankings),
    fetchCdnRankingsForDate: vi.fn().mockResolvedValue(rankings),
    fetchCdnRegionMembershipSeries: vi.fn(async () => cdn.series),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProgramYearProvider>
        <MemoryRouter initialEntries={['/regions']}>
          <Routes>
            <Route path="/regions" element={<RegionsPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )

describe('RegionsPage membership trend (#2127)', () => {
  it('draws one sparkline per region from the one program-year file', async () => {
    const { fetchCdnRegionMembershipSeries } =
      await import('../../services/cdn')
    renderPage()
    const table = await screen.findByRole('table', { name: 'Region rankings' })
    expect(
      await within(table).findByRole('img', {
        name: /^Membership 16,286 → 12,945 this program year/,
      })
    ).toBeInTheDocument()
    expect(
      within(table).getByRole('img', {
        name: /^Membership 17,234 → 13,278 this program year/,
      })
    ).toBeInTheDocument()
    expect(fetchCdnRegionMembershipSeries).toHaveBeenCalledTimes(1)
    expect(fetchCdnRegionMembershipSeries).toHaveBeenCalledWith('2026-2027')
  })

  it('renders the leaderboard without sparklines when the file 404s', async () => {
    cdn.series = null
    renderPage()
    const table = await screen.findByRole('table', { name: 'Region rankings' })
    expect(
      within(table).getByRole('link', { name: /^Region 05/ })
    ).toBeVisible()
    expect(within(table).queryAllByRole('img')).toHaveLength(0)
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(th => th.textContent?.trim())
    ).not.toContain('Trend')
  })
})
