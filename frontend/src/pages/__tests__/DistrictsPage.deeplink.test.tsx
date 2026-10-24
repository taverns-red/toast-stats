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
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
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

// Flush the passive effects queued by the data render. `findByText` resolves
// on the commit that paints the rows, before any post-data effect (such as a
// URL write) has run — so a "nothing was written" assertion must flush first
// or it passes vacuously.
const settle = () => act(async () => {})

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

    // Emptying the selection one chip at a time → back to "All", not an
    // empty table. Empty = all (product spec), so the param is dropped
    // rather than spelled out as the full region list (#2255).
    fireEvent.click(screen.getByRole('button', { name: 'Region 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Region 2' }))
    expect(screen.getByText('District 1')).toBeInTheDocument()
    expect(screen.getByText('District 3')).toBeInTheDocument()
    expect(new URLSearchParams(search()).get('regions')).toBeNull()
  })
})

/**
 * #2255 — an empty selection means all regions, so a first load of a bare
 * `/` must leave the URL bare. #978 used to inflate the selection to the
 * explicit region list once data landed, which `replaceState`d every cold
 * visit to `?regions=01,02,…,DNAR`. Shared and bookmarked `?regions=` links —
 * including ones carrying that full list — keep filtering exactly as before.
 */
describe('DistrictsPage — ?regions= stays clean unless the user filters (#2255)', () => {
  it('a first load of / keeps the URL free of ?regions=', async () => {
    setupThreeRegions()
    renderPage('/')

    await screen.findByText('District 1')
    await settle()
    expect(screen.getByText('District 2')).toBeInTheDocument()
    expect(screen.getByText('District 3')).toBeInTheDocument()
    expect(screen.getByText(/showing all regions/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(new URLSearchParams(search()).get('regions')).toBeNull()
  })

  it('a first load keeps unrelated params untouched and adds no regions', async () => {
    setupThreeRegions()
    renderPage('/?q=District')

    await screen.findByText('District 1')
    await settle()
    const params = new URLSearchParams(search())
    expect(params.get('regions')).toBeNull()
    expect(params.get('q')).toBe('District')
  })

  it('the All pill clears ?regions= instead of spelling out every region', async () => {
    setupThreeRegions()
    renderPage('/?regions=2')

    await screen.findByText('District 2')
    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    expect(screen.getByText('District 1')).toBeInTheDocument()
    expect(screen.getByText('District 3')).toBeInTheDocument()
    expect(new URLSearchParams(search()).get('regions')).toBeNull()
  })

  it('INWARD: a bookmarked full-list link shows all regions and is left as-is', async () => {
    setupThreeRegions()
    renderPage('/?regions=1,2,3')

    await screen.findByText('District 1')
    await settle()
    expect(screen.getByText('District 2')).toBeInTheDocument()
    expect(screen.getByText('District 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(new URLSearchParams(search()).get('regions')).toBe('1,2,3')
  })

  it('INWARD: a shared multi-region link filters and is left as-is', async () => {
    setupThreeRegions()
    renderPage('/?regions=1,3')

    await screen.findByText('District 1')
    await settle()
    expect(screen.getByText('District 3')).toBeInTheDocument()
    expect(screen.queryByText('District 2')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Region 1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Region 2' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(new URLSearchParams(search()).get('regions')).toBe('1,3')
  })

  it('from a bookmarked full-list link, a chip click still starts a one-region filter', async () => {
    setupThreeRegions()
    renderPage('/?regions=1,2,3')

    await screen.findByText('District 1')
    fireEvent.click(screen.getByRole('button', { name: 'Region 2' }))
    expect(new URLSearchParams(search()).get('regions')).toBe('2')
    expect(screen.queryByText('District 1')).not.toBeInTheDocument()
  })
})

describe('DistrictsPage deep-link — search (?q=)', () => {
  it('INWARD: mounting at ?q=2 filters to matching districts', async () => {
    setupThreeRegions()
    renderPage('/?q=2')

    await screen.findByText('District 2')
    expect(screen.queryByText('District 1')).not.toBeInTheDocument()
    expect(screen.queryByText('District 3')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/filter/i)).toHaveValue('2')
  })

  it('OUTWARD: typing pushes the settled query to ?q= (debounced)', async () => {
    setupThreeRegions()
    renderPage('/')

    await screen.findByText('District 1')

    fireEvent.change(screen.getByPlaceholderText(/filter/i), {
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
