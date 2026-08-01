/**
 * Landing header — the orientation sentence must not change shape when the
 * data lands (#1359 gap (b)).
 *
 * "Each row below is **a Toastmasters district** worldwide" became "**one of
 * the 128 Toastmasters districts**" the moment the rankings resolved. No
 * reserve can absorb a text substitution — it has to be the same sentence,
 * with a width-reserved slot where the number will appear.
 *
 * The TERMINAL error state deliberately keeps the countless phrasing (#1107):
 * a blank slot that never fills reads as a bug, and no user reaches a loaded
 * page through that branch, so there is no swap left to protect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankings } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: [],
    count: 0,
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  cdnAnalyticsUrl: vi.fn().mockReturnValue('https://cdn.taverns.red/test'),
  fetchFromCdn: vi.fn(),
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({
    data: { districts: [] },
    isLoading: false,
    isError: false,
  }),
}))

const mockedFetchCdnRankings = vi.mocked(fetchCdnRankings)

const row = (i: number) => ({
  districtId: `${i}`,
  districtName: `District ${i}`,
  region: '1',
  paidClubs: 100,
  paidClubBase: 90,
  clubGrowthPercent: 0,
  totalPayments: 5000,
  paymentBase: 4500,
  paymentGrowthPercent: 0,
  activeClubs: 100,
  distinguishedClubs: 50,
  selectDistinguished: 20,
  presidentsDistinguished: 10,
  distinguishedPercent: 50,
  clubsRank: i,
  paymentsRank: i,
  distinguishedRank: i,
  aggregateScore: 300 - i,
  overallRank: i,
})

const orientation = () => screen.getByTestId('districts-orientation')

describe('landing orientation sentence — CLS shape (#1359 gap b)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the SAME sentence in the loading shell, with a reserved count slot', async () => {
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}) as never)
    renderWithProviders(<DistrictsPage />)
    await screen.findByRole('status', { name: /loading district rankings/i })

    expect(orientation()).toHaveTextContent(
      /each row below is one of the\s*Toastmasters districts worldwide/i
    )
    // The slot is present and empty — its width comes from CSS, not content.
    const slot = screen.getByTestId('districts-orientation-count')
    expect(slot).toBeInTheDocument()
    expect(slot.textContent).toBe('')
    // Never "0 districts" (#1107).
    expect(orientation().textContent).not.toMatch(/\d/)
  })

  it('fills the same slot when the count arrives — no re-phrasing', async () => {
    mockedFetchCdnRankings.mockResolvedValue({
      rankings: [row(1), row(2)],
      asOfDate: '2025-11-22',
    } as never)
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 1')

    expect(orientation()).toHaveTextContent(
      /each row below is one of the 2 Toastmasters districts worldwide/i
    )
    expect(screen.getByTestId('districts-orientation-count').textContent).toBe(
      '2'
    )
  })

  it('keeps the countless phrasing in the terminal error state (#1107)', async () => {
    mockedFetchCdnRankings.mockRejectedValue(new Error('network down'))
    renderWithProviders(<DistrictsPage />)
    await screen.findByText(/error loading rankings/i)

    expect(orientation()).toHaveTextContent(
      /each row below is a Toastmasters district worldwide/i
    )
    expect(
      screen.queryByTestId('districts-orientation-count')
    ).not.toBeInTheDocument()
  })
})
