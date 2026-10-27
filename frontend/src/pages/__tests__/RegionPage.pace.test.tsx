import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionPage from '../RegionPage'
import { useRegionPace } from '../../hooks/useRegionPace'

vi.mock('../../hooks/useRegionPace', () => ({ useRegionPace: vi.fn() }))
const mockedPace = vi.mocked(useRegionPace)
import {
  fetchCdnRankings,
  fetchCdnCompetitiveAwards,
  type CompetitiveAwardStandings,
} from '../../services/cdn'

// #1301 — RegionPage now hosts the shared PY selector. An empty dates index
// keeps effectiveDate undefined, so the page uses its existing fetchCdnRankings
// ("latest") path and these fixtures/assertions are unchanged.
vi.mock('../../services/cdn', () => ({
  fetchCdnDistrictRegionHistory: vi.fn().mockResolvedValue(null),
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  // useCompetitiveAwards resolves "latest" through the branded mint helper
  // rather than reading the raw manifest itself (#1323).
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-05-12'),
}))

const mockedFetchCdnRankings = vi.mocked(fetchCdnRankings)
const mockedFetchCdnAwards = vi.mocked(fetchCdnCompetitiveAwards)

const mkRanking = (overrides: Record<string, unknown>) => ({
  districtId: '1',
  districtName: '1',
  region: '1',
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
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
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

const prereqs = {
  dspSubmitted: true,
  trainingMet: true,
  marketAnalysisSubmitted: true,
  communicationPlanSubmitted: true,
  regionAdvisorVisitMet: true,
}
const notYet = (districtId: string) => ({
  districtId,
  currentTier: 'NotDistinguished' as const,
  allPrerequisitesMet: true,
  prerequisites: prereqs,
  nextTierGap: null,
})

describe("RegionPage on track, based on last year's pace (#2307)", () => {
  it('shows on-track counts apart from meeting today', async () => {
    mockedPace.mockReturnValue({
      reference: {
        referenceDate: '2025-09-30',
        referenceProgramYear: '2025-2026',
      },
      medians: {
        Distinguished: {
          clubs: 1.05,
          payments: 1.05,
          distinguished: 0.1,
          districts: 42,
        },
        Select: null,
      },
    })
    mockedFetchCdnRankings.mockResolvedValueOnce({
      rankings: [
        // 100/90 clubs, 5000/4500 payments, 50/90 distinguished: on track.
        mkRanking({ districtId: '61', region: '2' }),
        // Paid clubs below the base: not on track.
        mkRanking({ districtId: '86', region: '2', paidClubs: 80 }),
      ],
      asOfDate: '2026-05-12',
      generatedAt: '2026-05-12T00:00:00Z',
    })
    mockedFetchCdnAwards.mockResolvedValue({
      metadata: { snapshotId: 'x', calculatedAt: 'x', totalDistricts: 2 },
      extensionAward: [],
      twentyPlusAward: [],
      retentionAward: [],
      byDistrict: {},
      distinguishedDistrict: { '61': notYet('61'), '86': notYet('86') },
    } as CompetitiveAwardStandings)
    renderRegion('2')

    const cards = await screen.findAllByTestId('recognition-tier')
    expect(cards[0]).toHaveTextContent(/0 of 2\s*meet it today/i)
    expect(
      within(cards[0]!).getByTestId('recognition-on-track')
    ).toHaveTextContent("On track, based on last year's pace: 1 of 2")
    expect(
      within(cards[1]!).getByTestId('recognition-on-track')
    ).toHaveTextContent(/not available/i)
    expect(mockedPace).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{4}$/),
      undefined
    )
  })

  it("says when last year's pace is not available", async () => {
    mockedPace.mockReturnValue({ reference: null, medians: null })
    mockedFetchCdnRankings.mockResolvedValueOnce({
      rankings: [mkRanking({ districtId: '61', region: '2' })],
      asOfDate: '2026-05-12',
      generatedAt: '2026-05-12T00:00:00Z',
    })
    mockedFetchCdnAwards.mockResolvedValue({
      metadata: { snapshotId: 'x', calculatedAt: 'x', totalDistricts: 1 },
      extensionAward: [],
      twentyPlusAward: [],
      retentionAward: [],
      byDistrict: {},
      distinguishedDistrict: { '61': notYet('61') },
    } as CompetitiveAwardStandings)
    renderRegion('2')
    await screen.findAllByTestId('recognition-tier')
    expect(screen.queryAllByTestId('recognition-on-track')).toHaveLength(0)
    expect(screen.getByTestId('region-recognition')).toHaveTextContent(
      /last year's pace is not available/i
    )
  })
})
