/**
 * Landing hero wiring (#2249): the my-district card under the search, the
 * World pulse after the KPI strip, and the KPI deltas vs the program-year
 * base — in the loaded tree AND reserved in the loading shell.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankings } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'
import { storageKey } from '../../utils/localStorageStore'

const star = (id: string) =>
  window.localStorage.setItem(storageKey('my-district-id'), JSON.stringify(id))

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
  fetchCdnRegionRollups: vi.fn().mockResolvedValue(null),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2025-11-22'),
  fetchCdnRegionMembershipSeries: vi.fn().mockResolvedValue(null),
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

const row = (districtId: string, region: string, overallRank: number) => ({
  districtId,
  districtName: `District ${districtId}`,
  region,
  paidClubs: 100,
  paidClubBase: 90,
  clubGrowthPercent: 11.1,
  totalPayments: 5000,
  paymentBase: 5200,
  paymentGrowthPercent: -3.8,
  activeClubs: 100,
  distinguishedClubs: 25,
  selectDistinguished: 10,
  presidentsDistinguished: 5,
  distinguishedPercent: 25,
  clubsRank: overallRank,
  paymentsRank: overallRank,
  distinguishedRank: overallRank,
  aggregateScore: 300 - overallRank,
  overallRank,
})

const setupWithData = () => {
  mockedFetchCdnRankings.mockResolvedValueOnce({
    rankings: [row('57', '01', 1), row('61', '05', 2), row('83', '01', 3)],
    asOfDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
  })
}

describe('DistrictsPage — landing hero wiring (#2249)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('shows the starred district as a card under the search, with its rank', async () => {
    star('61')
    setupWithData()
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    const card = screen.getByTestId('my-district-card')
    expect(card).toHaveAttribute('href', '/district/61')
    expect(card).toHaveTextContent(/rank #2 of 3/i)
    const stack = container.querySelector('.districts-hero-stack')!
    expect(stack.children[0]).toHaveClass('districts-toolbar__search--hero')
    expect(stack.children[1]).toBe(card)
  })

  it('reserves the card in the loading shell only when a star is set', () => {
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}))
    const { container, unmount } = renderWithProviders(<DistrictsPage />)
    expect(container.querySelector('.my-district-card')).toBeNull()
    unmount()
    star('61')
    const { container: c2 } = renderWithProviders(<DistrictsPage />)
    expect(c2.querySelector('.my-district-card--reserve')).not.toBeNull()
  })

  it('renders the World pulse after the KPI strip, and reserves it while loading', async () => {
    setupWithData()
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    const pulse = screen.getByRole('region', { name: /world pulse/i })
    const strip = container.querySelector('.districts-kpi-strip')!
    expect(strip.nextElementSibling).toBe(pulse)
    const regions = within(pulse).getByRole('table', { name: /regions/i })
    expect(within(regions).getAllByRole('row')).toHaveLength(3) // head + 2
  })

  it('reserves the World pulse box in the loading shell', () => {
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}))
    const { container } = renderWithProviders(<DistrictsPage />)
    expect(container.querySelector('.world-pulse--reserve')).not.toBeNull()
  })

  it('puts the Red Vote block right after the World pulse, in both shells, and retires the landing banner', async () => {
    mockedFetchCdnRankings.mockReturnValueOnce(new Promise(() => {}))
    const { container, unmount } = renderWithProviders(<DistrictsPage />)
    expect(container.querySelector('.red-vote-block')).not.toBeNull()
    unmount()

    setupWithData()
    const { container: c2 } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    const pulse = screen.getByRole('region', { name: /world pulse/i })
    expect(pulse.nextElementSibling).toBe(screen.getByTestId('red-vote-block'))
    // One Red Vote surface on the landing: no seasonal banner / promo card.
    expect(c2.querySelector('.red-vote-promo')).toBeNull()
  })

  it('states each KPI against the program-year base, with a held slot while loading', async () => {
    mockedFetchCdnRankings.mockReturnValueOnce(new Promise(() => {}))
    const { unmount } = renderWithProviders(<DistrictsPage />)
    expect(screen.getByTestId('kpi-paid-clubs-delta')).toHaveTextContent('—')
    unmount()

    setupWithData()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    expect(screen.getByTestId('kpi-paid-clubs-delta')).toHaveTextContent(
      /\+30 vs base/
    )
    expect(screen.getByTestId('kpi-total-payments-delta')).toHaveTextContent(
      /−600 vs base/
    )
    expect(
      screen.getByTestId('kpi-distinguished-clubs-delta')
    ).toHaveTextContent(/25% of paid clubs/)
  })
})
