/**
 * Deep-link round-trip tests for DistrictsPage landing controls (#978, epic
 * #969 — site-wide deep-link audit, §4 `/` P1).
 *
 * Every core control must encode its state in the URL so reload, back button,
 * and shared links preserve it:
 *   - Region filter pills  → ?regions=1,2,3
 *   - Search box           → ?q=
 *
 * (`?pinned=` was the third; select-to-compare was retired in #1364 and the
 * param is now silently ignored — see the last describe block.)
 *
 * Each control gets two assertions that together prove the round-trip:
 *   INWARD  — mount at a URL carrying the param ⇒ state is reflected (this is
 *             what a reload / shared link / back-button restore replays).
 *   OUTWARD — drive the control ⇒ the URL gains/loses the param.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useLocation } from 'react-router-dom'
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

// A probe that surfaces the live URL search string for assertions.
const LocationProbe = () => {
  const location = useLocation()
  return <span data-testid="loc-search">{location.search}</span>
}

const renderPage = (initialEntry = '/') =>
  renderWithProviders(
    <>
      <DistrictsPage />
      <LocationProbe />
    </>,
    { initialEntries: [initialEntry] }
  )

const search = () => screen.getByTestId('loc-search').textContent ?? ''

const row = (
  i: number,
  region: string
): import('../../services/cdn').CdnRankingsData['rankings'][number] => ({
  districtId: `${i}`,
  districtName: `District ${i}`,
  region,
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

const setupThreeRegions = () => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: [row(1, '1'), row(2, '2'), row(3, '3')],
    asOfDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
  })
}

const setupFiveDistricts = () => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: [row(1, '1'), row(2, '1'), row(3, '1'), row(4, '1'), row(5, '1')],
    asOfDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('DistrictsPage deep-link — region filter (?regions=)', () => {
  it('INWARD: mounting at ?regions=2 shows only region 2', async () => {
    setupThreeRegions()
    renderPage('/?regions=2')

    await screen.findByText('District 2')
    expect(screen.queryByText('District 1')).not.toBeInTheDocument()
    expect(screen.queryByText('District 3')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Region 2' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('OUTWARD: region pills accumulate into ?regions=, and clearing the last returns to all', async () => {
    setupThreeRegions()
    renderPage('/')

    await screen.findByText('District 1')

    // Filter to one region → only that region in the param + table.
    fireEvent.click(screen.getByRole('button', { name: 'Region 2' }))
    expect(new URLSearchParams(search()).get('regions')).toBe('2')
    expect(screen.queryByText('District 1')).not.toBeInTheDocument()

    // A second plain click ADDS to the param rather than replacing it
    // (#1374 — the multi-select the ?regions= list contract always allowed).
    fireEvent.click(screen.getByRole('button', { name: 'Region 3' }))
    expect(new URLSearchParams(search()).get('regions')).toBe('2,3')
    expect(screen.getByText('District 3')).toBeInTheDocument()
    expect(screen.queryByText('District 1')).not.toBeInTheDocument()

    // Emptying the selection one chip at a time → back to the full (inflated)
    // set, not an empty table.
    fireEvent.click(screen.getByRole('button', { name: 'Region 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Region 2' }))
    expect(screen.getByText('District 1')).toBeInTheDocument()
    expect(screen.getByText('District 3')).toBeInTheDocument()
    // The region param now carries the explicit full set (deep-linkable), not
    // a bare URL (storage-backend swap of the localStorage default — #978).
    expect(new URLSearchParams(search()).get('regions')?.split(',')).toEqual(
      expect.arrayContaining(['1', '2', '3'])
    )
  })
})

describe('DistrictsPage deep-link — search (?q=)', () => {
  it('INWARD: mounting at ?q=2 filters to matching districts', async () => {
    setupThreeRegions()
    renderPage('/?q=2')

    await screen.findByText('District 2')
    expect(screen.queryByText('District 1')).not.toBeInTheDocument()
    expect(screen.queryByText('District 3')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search/i)).toHaveValue('2')
  })

  it('OUTWARD: typing pushes the settled query to ?q= (debounced)', async () => {
    setupThreeRegions()
    renderPage('/')

    await screen.findByText('District 1')

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: '3' },
    })

    await waitFor(() =>
      expect(new URLSearchParams(search()).get('q')).toBe('3')
    )
  })
})

/**
 * #1364 — select-to-compare is retired, and with it the `?pinned=` sync. The
 * param has been shared and bookmarked, so the contract for an old link is
 * *silence*: it loads the rankings page normally and pins nothing. No
 * redirect, no warning, no leftover inward parse. These replace the three
 * round-trip tests above, whose behaviour is intentionally gone (R1).
 */
describe('DistrictsPage — retired ?pinned= param (#1364)', () => {
  it('INWARD: an old /?pinned=1,2 link loads normally and pins nothing', async () => {
    setupThreeRegions()
    renderPage('/?pinned=1,2')

    // The table renders as it would at a bare `/`.
    await screen.findByText('District 1')
    expect(screen.getByText('District 2')).toBeInTheDocument()

    // No compare affordance survives: no per-row bookmark button, no panel.
    expect(screen.queryByRole('button', { name: /^pin district/i })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /^unpin district/i })
    ).toBeNull()
    expect(screen.queryByText(/Comparing \d+ Districts/i)).toBeNull()
  })

  it('INWARD: leaves the stale param untouched — no redirect, no rewrite', async () => {
    setupFiveDistricts()
    renderPage('/?pinned=1,2,3,4,5')

    await screen.findByText('District 1')
    // Not read, not capped, not stripped. The page simply ignores it.
    expect(new URLSearchParams(search()).get('pinned')).toBe('1,2,3,4,5')
  })

  it('keeps the Star "my district" feature, which also says "pin" in its copy', async () => {
    setupThreeRegions()
    renderPage('/')

    await screen.findByText('District 1')
    const star = screen.getByRole('button', {
      name: /set district 1 as my district/i,
    })
    fireEvent.click(star)
    expect(
      screen.getByRole('button', {
        name: /unset district 1 as my district/i,
      })
    ).toBeInTheDocument()
  })
})
