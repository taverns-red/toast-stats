/**
 * Rank badge weight (#1363).
 *
 * Every row used to render its rank as a 40px filled circle, and because
 * `getRankBadgeColor` handed ranks 11+ a grey circle, most rows carried heavy
 * visual weight conveying nothing the numeral inside it didn't already say.
 *
 * The contract now: the circle is the PODIUM's, not every row's.
 *   - ranks 1–3 keep a filled medal circle (gold / silver / bronze), shrunk
 *     40px → 28px (`w-10 h-10` → `w-7 h-7`);
 *   - ranks 4+ are a plain bold right-aligned numeral — no circle, no fill.
 *
 * The badge is a non-interactive <span>, so the WCAG 2.5.5 44px touch-target
 * floor does NOT apply (that floor is `styles/layers/base.css`'s `button`
 * rule — the distinction that caused the InfoTooltip under-reserve in #1359).
 * jsdom has no layout engine (Lesson 66), so these assert the classes the
 * geometry comes from.
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

const row = (rank: number) => ({
  districtId: `${rank}`,
  districtName: `District ${rank}`,
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
  clubsRank: rank,
  paymentsRank: rank,
  distinguishedRank: rank,
  aggregateScore: 300 - rank,
  overallRank: rank,
})

/** Podium, first off-podium, and a rank that used to get the grey circle. */
const RANKS = [1, 2, 3, 4, 11]

const setup = () => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: RANKS.map(row),
    asOfDate: '2025-11-22',
  } as never)
}

const badge = (rank: number) => screen.getByTestId(`rank-badge-${rank}`)

describe('DistrictsPage rank badge (#1363)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps a filled medal circle for ranks 1–3, shrunk to 28px', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 1')

    const medals: Array<[number, RegExp]> = [
      [1, /bg-yellow-500/],
      [2, /bg-gray-400/],
      [3, /bg-amber-600/],
    ]
    for (const [rank, fill] of medals) {
      const el = badge(rank)
      expect(el.className).toMatch(/rounded-full/)
      // 28px, not the old 40px (w-10 h-10).
      expect(el.className).toMatch(/\bw-7\b/)
      expect(el.className).toMatch(/\bh-7\b/)
      expect(el.className).not.toMatch(/\bw-10\b/)
      expect(el.className).not.toMatch(/\bh-10\b/)
      // Colours unchanged — white on the medal fill (AA in both themes).
      expect(el.className).toMatch(fill)
      expect(el.className).toMatch(/text-white/)
    }
  })

  it('renders ranks 4+ as a plain numeral — no circle, no fill', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 4')

    for (const rank of [4, 11]) {
      const el = badge(rank)
      expect(el.className).not.toMatch(/rounded-full/)
      expect(el.className).not.toMatch(/\bbg-/)
      expect(el.className).not.toMatch(/\bw-7\b|\bw-10\b/)
      // Still the strongest thing in its cell.
      expect(el.className).toMatch(/font-bold/)
    }
  })

  it('retires the rank<=10 blue and the grey fallback fills', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 4')

    // 4 and 11 sat either side of the old `rank <= 10` boundary and got
    // bg-tm-loyal-blue / bg-gray-200 respectively. Both branches are gone.
    expect(badge(4).className).not.toMatch(/bg-tm-loyal-blue/)
    expect(badge(11).className).not.toMatch(/bg-gray-200/)
  })

  it('right-aligns the rank column so the numerals line up', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 4')

    expect(screen.getByTestId('rank-cell-4').className).toMatch(/text-right/)
  })

  it('keeps every rank readable by assistive tech', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 1')

    for (const rank of RANKS) {
      const el = badge(rank)
      // Plain text content in a cell under the "Rank" column header — no
      // aria-hidden, no icon-only substitution.
      expect(el.textContent?.trim()).toBe(String(rank))
      expect(el).not.toHaveAttribute('aria-hidden')
    }
  })
})
