import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankings } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'

/* RED tests for #519 + #520. Ranking row hygiene:

   - #519 — drop the "Analytics" chip rendered on tracked districts. The
     row is already a link into the district detail page; the chip adds
     visual noise without disambiguating anything.

   - #520 — drop the bare numeric district name that follows the D## chip
     when the name is purely the district number (which is the prod
     reality: TI's all-districts-rankings CSV's DISTRICT field is just
     the number, so we end up rendering "D86" + "86" side-by-side).
     If a district has a richer name (e.g. "District 57 Carolinas"),
     keep it. */

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: [],
    count: 0,
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnRankings: vi.fn(),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  cdnAnalyticsUrl: vi.fn().mockReturnValue('https://cdn.taverns.red/test'),
  fetchFromCdn: vi.fn(),
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({
    data: {
      districts: [
        { id: '86', name: 'District 86' },
        { id: '57', name: 'District 57' },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}))

const mockedFetchCdnRankings = vi.mocked(fetchCdnRankings)

const baseRanking = {
  region: '1',
  paidClubs: 100,
  paidClubBase: 90,
  clubGrowthPercent: 10,
  totalPayments: 5000,
  paymentBase: 4500,
  paymentGrowthPercent: 10,
  activeClubs: 100,
  distinguishedClubs: 50,
  selectDistinguished: 20,
  presidentsDistinguished: 10,
  distinguishedPercent: 50,
  clubsRank: 1,
  paymentsRank: 1,
  distinguishedRank: 1,
  aggregateScore: 300,
}

describe('DistrictsPage row cleanup (#519 #520)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('#519: does not render an "Analytics" chip on any ranking row', async () => {
    mockedFetchCdnRankings.mockResolvedValueOnce({
      rankings: [
        {
          ...baseRanking,
          districtId: '86',
          // Tracked districts previously got an Analytics chip. We want
          // it gone regardless of tracking state.
          districtName: '86',
        },
      ],
      date: '2025-11-22',
    })

    renderWithProviders(<DistrictsPage />)

    // Wait for the row to render via the D## chip's stable test id.
    await screen.findByTestId('district-number-chip-D86')

    // Assert: no element with the literal "Analytics" label anywhere
    // inside the row's district cell.
    const analyticsBadges = screen.queryAllByText(/^Analytics$/i)
    expect(analyticsBadges).toHaveLength(0)
  })

  it('#520: omits the bare district number when districtName is purely numeric (chip already conveys it)', async () => {
    mockedFetchCdnRankings.mockResolvedValueOnce({
      rankings: [
        {
          ...baseRanking,
          districtId: '86',
          // Production data shape — districtName is just the number,
          // so rendering it next to the D86 chip duplicates information.
          districtName: '86',
        },
      ],
      date: '2025-11-22',
    })

    renderWithProviders(<DistrictsPage />)

    // The D## chip should render exactly once.
    const chip = await screen.findByTestId('district-number-chip-D86')
    expect(chip.textContent).toBe('D86')

    // There should be no plain-text "86" sibling inside the same cell.
    // queryAllByText finds DOM nodes whose entire text content is "86".
    const bareEightySix = screen.queryAllByText('86', { selector: 'span' })
    expect(bareEightySix).toHaveLength(0)
  })

  it('#520: keeps a richer district name when it is not purely numeric', async () => {
    mockedFetchCdnRankings.mockResolvedValueOnce({
      rankings: [
        {
          ...baseRanking,
          districtId: '57',
          districtName: 'District 57 Carolinas',
        },
      ],
      date: '2025-11-22',
    })

    renderWithProviders(<DistrictsPage />)
    expect(await screen.findByText('District 57 Carolinas')).toBeInTheDocument()
  })
})
