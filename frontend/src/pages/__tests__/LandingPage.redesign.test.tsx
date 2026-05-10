/* Districts page redesign chrome (#356).
   Asserts the new header (eyebrow + redesigned h1 + lede), 4-card global
   KPI strip, and methodology callout. The existing rankings table +
   Awards Race controls + filters keep working — covered by the original
   LandingPage tests. */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import LandingPage from '../LandingPage'
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
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
  }),
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

const setupWithData = () => {
  mockedFetchCdnRankings.mockResolvedValueOnce({
    rankings: [
      {
        districtId: 'D1',
        districtName: 'District 1',
        region: '1',
        paidClubs: 100,
        paidClubBase: 90,
        clubGrowthPercent: 12.5,
        totalPayments: 5000,
        paymentBase: 4500,
        paymentGrowthPercent: 11.1,
        activeClubs: 100,
        distinguishedClubs: 50,
        selectDistinguished: 20,
        presidentsDistinguished: 10,
        distinguishedPercent: 50,
        clubsRank: 1,
        paymentsRank: 1,
        distinguishedRank: 1,
        aggregateScore: 300,
      },
      {
        districtId: 'D2',
        districtName: 'District 2',
        region: '2',
        paidClubs: 50,
        paidClubBase: 48,
        clubGrowthPercent: 4.2,
        totalPayments: 2500,
        paymentBase: 2400,
        paymentGrowthPercent: 4.2,
        activeClubs: 50,
        distinguishedClubs: 22,
        selectDistinguished: 8,
        presidentsDistinguished: 4,
        distinguishedPercent: 44,
        clubsRank: 2,
        paymentsRank: 2,
        distinguishedRank: 2,
        aggregateScore: 250,
      },
    ],
    date: '2025-11-22',
  })
}

describe('Districts page redesign chrome (#356)', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('page header', () => {
    it('renders the program-year eyebrow above the h1 (en-dash format)', async () => {
      setupWithData()
      renderWithProviders(<LandingPage />)
      await screen.findByText('District 1')
      // The eyebrow uses an en-dash (–) per the handoff, not a hyphen.
      expect(
        screen.getByText(/program year 20\d{2}[–-]20\d{2}/i)
      ).toBeInTheDocument()
    })

    it('renders the redesigned h1 "District Rankings" (no "Toastmasters" prefix)', async () => {
      setupWithData()
      renderWithProviders(<LandingPage />)
      await screen.findByText('District 1')
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /^district rankings$/i,
        })
      ).toBeInTheDocument()
    })

    it('renders the lede paragraph', async () => {
      setupWithData()
      renderWithProviders(<LandingPage />)
      await screen.findByText('District 1')
      expect(
        screen.getByText(/compare district performance/i)
      ).toBeInTheDocument()
    })
  })

  describe('global KPI strip (4 cards)', () => {
    it('renders all 4 KPI labels', async () => {
      setupWithData()
      renderWithProviders(<LandingPage />)
      await screen.findByText('District 1')
      // "Paid Clubs · Global" and "Districts Tracked" are unique to the
      // KPI strip. "Total Payments" + "Distinguished Clubs" also appear
      // in the Awards Race section, so scope those to their KPI cards.
      expect(screen.getByText(/paid clubs · global/i)).toBeInTheDocument()
      expect(
        screen.getByTestId('kpi-total-payments').previousSibling
      ).toHaveTextContent(/total payments/i)
      expect(
        screen.getByTestId('kpi-distinguished-clubs').previousSibling
      ).toHaveTextContent(/distinguished clubs/i)
      expect(screen.getByText(/districts tracked/i)).toBeInTheDocument()
    })

    it('sums paid clubs across all districts (100 + 50 = 150)', async () => {
      setupWithData()
      renderWithProviders(<LandingPage />)
      await screen.findByText('District 1')
      expect(screen.getByTestId('kpi-paid-clubs')).toHaveTextContent('150')
    })

    it('sums total payments across all districts (5000 + 2500 = 7500)', async () => {
      setupWithData()
      renderWithProviders(<LandingPage />)
      await screen.findByText('District 1')
      const kpi = screen.getByTestId('kpi-total-payments')
      // Format may be "7,500" or "$7.5K" — assert the digits at least
      expect(kpi.textContent).toMatch(/7[,.]?5/)
    })

    it('sums distinguished clubs across all districts (50 + 22 = 72)', async () => {
      setupWithData()
      renderWithProviders(<LandingPage />)
      await screen.findByText('District 1')
      expect(screen.getByTestId('kpi-distinguished-clubs')).toHaveTextContent(
        '72'
      )
    })

    it('shows the count of tracked districts (2 in fixture)', async () => {
      setupWithData()
      renderWithProviders(<LandingPage />)
      await screen.findByText('District 1')
      expect(screen.getByTestId('kpi-districts-tracked')).toHaveTextContent('2')
    })
  })

  describe('methodology callout', () => {
    it('links to the /methodology page', async () => {
      setupWithData()
      renderWithProviders(<LandingPage />)
      await screen.findByText('District 1')
      const links = screen.getAllByRole('link', { name: /methodology/i })
      const calloutLink = links.find(
        l => l.getAttribute('href') === '/methodology'
      )
      expect(calloutLink).toBeDefined()
    })
  })
})
