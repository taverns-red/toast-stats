import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RegionsPage from '../RegionsPage'

/* Sprint C test suite (#496, #492). Red-first per Lesson 54. */

afterEach(() => cleanup())

const mkRanking = (region: string, districtId: string, aggregateScore = 100) =>
  ({
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
    aggregateScore,
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
  }) as unknown as ReturnType<typeof Object>

vi.mock('../../services/cdn', () => ({
  fetchCdnRankings: vi.fn().mockResolvedValue({
    date: '2026-05-12',
    rankings: [
      mkRanking('01', '01', 500),
      mkRanking('01', '02', 400),
      mkRanking('07', '57', 350),
      mkRanking('07', '60', 300),
      mkRanking('DNAR', '99', 50),
    ],
  }),
}))

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/regions']}>
        <Routes>
          <Route path="/regions" element={<RegionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('RegionsPage (#496)', () => {
  it('renders the page header with eyebrow + h1 "Regions"', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', { level: 1, name: /^regions$/i })
    ).toBeInTheDocument()
  })

  it('renders the leaderboard table + grid sections', async () => {
    renderPage()
    // Wait for data to land
    await screen.findByRole('table', { name: /region rankings/i })
    // Leaderboard
    expect(
      screen.getByRole('table', { name: /region rankings/i })
    ).toBeInTheDocument()
    // Grid (find by Region label appearing in card eyebrow context)
    expect(screen.getAllByText(/Region 01/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Region 07/).length).toBeGreaterThan(0)
  })

  it('excludes DNAR districts from the leaderboard', async () => {
    renderPage()
    await screen.findByRole('table', { name: /region rankings/i })
    // DNAR (region "DNAR") must not appear
    expect(screen.queryByText(/Region DNAR/)).not.toBeInTheDocument()
  })

  it('shows a DNAR footnote when DNAR districts exist in the data', async () => {
    renderPage()
    await screen.findByRole('table', { name: /region rankings/i })
    // 1 DNAR district in the fixture → footnote should appear
    expect(
      screen.getByText(/1 district.*not.*assigned to a region/i)
    ).toBeInTheDocument()
  })
})
